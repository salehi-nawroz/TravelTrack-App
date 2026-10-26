import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The real Map component with React-Leaflet stubbed: which markers it would
// draw for the normal city map vs. an open trip.
const mapApi = vi.hoisted(() => ({
  setView: vi.fn(),
  fitBounds: vi.fn(),
  getCenter: vi.fn(() => ({ lat: 40, lng: 0 })),
  getZoom: vi.fn(() => 6),
}));

function mockLeafletAndApp() {
  vi.doMock("react-leaflet", async () => {
    const { forwardRef, useImperativeHandle } = await import("react");
    return {
      useMap: () => mapApi,
      useMapEvents: () => null,
      MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
      TileLayer: () => null,
      ZoomControl: () => null,
      Circle: () => null,
      Marker: forwardRef(function Marker({ title, icon, children }, ref) {
        useImperativeHandle(ref, () => ({ openPopup: () => {} }));
        return (
          <div data-testid="marker" data-title={title ?? ""} data-icon={icon?.options?.html ?? ""}>
            {children}
          </div>
        );
      }),
      Popup: ({ children }) => <div>{children}</div>,
      Polyline: ({ pathOptions }) => (pathOptions.dashArray ? <div data-testid="route" /> : null),
    };
  });
  vi.doMock("./MapAutoResize", () => ({ default: () => null }));
  vi.doMock("../services/supabaseClient", () => import("../test/supabaseMock"));
  vi.doMock("../contexts/CitiesContext", () => ({
    useCities: () => ({
      cities: [
        {
          id: "c1",
          cityName: "Kyoto",
          country: "Japan",
          countryCode: "JP",
          date: new Date(2024, 9, 3),
          notes: "",
          position: { lat: 35.01, lng: 135.77 },
        },
      ],
    }),
  }));
}

const trip = {
  id: "t1",
  title: "Iberia",
  destinations: [
    { id: "d1", sortOrder: 0, cityName: "Lisbon", country: "Portugal", countryCode: "PT", position: { lat: 38.7, lng: -9.1 } },
    { id: "d2", sortOrder: 1, cityName: "Porto", country: "Portugal", countryCode: "PT", position: { lat: 41.1, lng: -8.6 } },
    { id: "d3", sortOrder: 2, cityName: "Nowhere", country: "Portugal", countryCode: "PT", position: null },
  ],
};

// Map and the context must come from the same (freshly reset) module set.
async function loadMap() {
  const { default: Map } = await import("./Map");
  const { NO_TRIP_MAP, TripMapContext } = await import("../contexts/tripMapContext");
  return { Map, NO_TRIP_MAP, TripMapContext };
}

async function renderMap(mapTrip, { path = "/app/trips/t1" } = {}) {
  const { Map, NO_TRIP_MAP, TripMapContext } = await loadMap();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TripMapContext.Provider value={{ ...NO_TRIP_MAP, mapTrip }}>
        <Map />
      </TripMapContext.Provider>
    </MemoryRouter>,
  );
}

const cityPins = () => screen.queryAllByTestId("marker").filter((m) => /cityPin/.test(m.dataset.icon));
const tripStops = () => screen.queryAllByTestId("marker").filter((m) => m.dataset.title.startsWith("Stop "));

beforeEach(() => {
  vi.resetModules();
  Object.values(mapApi).forEach((fn) => fn.mockClear());
});
afterEach(cleanup);

describe("Map trip mode", () => {
  beforeEach(() => mockLeafletAndApp());

  it("shows the city pins when no trip is open", async () => {
    await renderMap(null, { path: "/app/cities" });
    expect(cityPins()).toHaveLength(1);
    expect(tripStops()).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("replaces the city pins with the open trip's stops and route", async () => {
    await renderMap(trip);
    expect(cityPins()).toHaveLength(0);
    expect(tripStops().map((m) => m.dataset.title)).toEqual(["Stop 1: Lisbon", "Stop 2: Porto"]);
    expect(screen.getAllByTestId("route")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toBe("Trip: Iberia · 2 of 3 stops on the map");
  });

  it("keeps the search box and 'Use your position' while a trip is open", async () => {
    await renderMap(trip);
    expect(screen.getByLabelText("Search for a city or country")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use Your Position" })).toBeTruthy();
  });

  it("restores the city pins once the trip is closed", async () => {
    const { Map, NO_TRIP_MAP, TripMapContext } = await loadMap();
    const ui = (mapTrip) => (
      <MemoryRouter initialEntries={["/app/trips"]}>
        <TripMapContext.Provider value={{ ...NO_TRIP_MAP, mapTrip }}>
          <Map />
        </TripMapContext.Provider>
      </MemoryRouter>
    );
    const { rerender } = render(ui(trip));
    expect(cityPins()).toHaveLength(0);
    rerender(ui(null));
    expect(cityPins()).toHaveLength(1);
    expect(tripStops()).toHaveLength(0);
  });
});
