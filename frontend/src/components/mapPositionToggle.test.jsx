import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Map from "./Map";
import { useGeolocation } from "../hooks/useGeolocation";

// The real Map with React-Leaflet stubbed: the "Use Your Position" toggle,
// driven by a fake navigator.geolocation whose replies the tests release.
const mapApi = vi.hoisted(() => ({
  setView: vi.fn(),
  fitBounds: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 40, lng: 0 })),
  getZoom: vi.fn(() => 6),
}));

vi.mock("react-leaflet", () => ({
  useMap: () => mapApi,
  useMapEvents: () => null,
  MapContainer: ({ center, zoom, children }) => (
    <div data-testid="map" data-center={center.join(",")} data-zoom={zoom}>
      {children}
    </div>
  ),
  TileLayer: () => null,
  ZoomControl: () => null,
  Circle: () => <div data-testid="accuracy" />,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: () => null,
}));
vi.mock("./MapAutoResize", () => ({ default: () => null }));
vi.mock("../contexts/CitiesContext", () => ({ useCities: () => ({ cities: [] }) }));

// Pending getCurrentPosition calls, answered by the tests.
let requests;
const succeed = (coords, i = requests.length - 1) =>
  act(() => requests[i].success({ coords: { accuracy: 30, ...coords } }));
const fail = (code, i = requests.length - 1) => act(() => requests[i].error({ code }));

beforeEach(() => {
  requests = [];
  Object.values(mapApi).forEach((fn) => fn.mockClear());
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success, error) => requests.push({ success, error })),
    },
  });
});
afterEach(cleanup);

const renderMap = () =>
  render(
    <MemoryRouter initialEntries={["/app/cities"]}>
      <Map />
    </MemoryRouter>,
  );
const toggle = () => screen.getByRole("button", { name: /Use Your Position|Locating|Back to Default View/ });
const lastView = () => mapApi.setView.mock.calls.at(-1);

describe("Use Your Position toggle", () => {
  it("starts on the default view", () => {
    renderMap();
    expect(toggle().textContent).toBe("Use Your Position");
    expect(screen.getByTestId("map").dataset.center).toBe("40,0");
    expect(screen.getByTestId("map").dataset.zoom).toBe("6");
    expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("goes to the user's position, then back to the same default view", async () => {
    renderMap();
    fireEvent.click(toggle());
    expect(toggle().textContent).toBe("Locating…");
    expect(toggle().disabled).toBe(true);

    await succeed({ latitude: 51.5, longitude: -0.12 });
    expect(lastView()).toEqual([[51.5, -0.12], 12, { animate: false }]);
    expect(toggle().textContent).toBe("Back to Default View");
    expect(screen.getByText("You are here")).toBeTruthy();

    fireEvent.click(toggle());
    expect(lastView()).toEqual([[40, 0], 6, { animate: false }]);
    expect(toggle().textContent).toBe("Use Your Position");
    expect(screen.queryByText("You are here")).toBeNull();

    // And again: the toggle can be repeated.
    fireEvent.click(toggle());
    await succeed({ latitude: 48.85, longitude: 2.35 });
    expect(lastView()).toEqual([[48.85, 2.35], 12, { animate: false }]);
    expect(toggle().textContent).toBe("Back to Default View");
  });

  it("asks the browser only once while a request is pending", () => {
    renderMap();
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it("stays on the default view when the browser refuses", async () => {
    renderMap();
    fireEvent.click(toggle());
    await fail(1);
    expect(toggle().textContent).toBe("Use Your Position");
    expect(screen.getByRole("alert").textContent).toMatch(/Location access was blocked/);
    expect(mapApi.setView.mock.calls.some(([, zoom]) => zoom === 12)).toBe(false);
  });

  it("rejects invalid coordinates", async () => {
    renderMap();
    fireEvent.click(toggle());
    await succeed({ latitude: Number.NaN, longitude: 200 });
    expect(toggle().textContent).toBe("Use Your Position");
    expect(screen.getByRole("alert").textContent).toMatch(/could not be read/);
    expect(mapApi.setView.mock.calls.some(([, zoom]) => zoom === 12)).toBe(false);
  });

});

describe("useGeolocation stale replies", () => {
  it("ignores a reply to a request cancelled by clearPosition", async () => {
    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.getPosition());
    act(() => result.current.clearPosition());
    expect(result.current.isLoading).toBe(false);

    await succeed({ latitude: 51.5, longitude: -0.12 });
    expect(result.current.position).toBeNull();

    // A new request still works afterwards.
    act(() => result.current.getPosition());
    await succeed({ latitude: 48.85, longitude: 2.35 });
    expect(result.current.position).toMatchObject({ lat: 48.85, lng: 2.35 });
  });
});
