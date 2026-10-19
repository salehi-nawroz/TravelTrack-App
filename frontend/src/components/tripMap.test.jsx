import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import TripMapLayer from "./TripMapLayer";
import TripDetail from "./TripDetail";
import TripMapProvider from "../contexts/TripMapProvider";
import { useTripMap } from "../contexts/tripMapContext";
import {
  addDestination,
  deleteDestination,
  getTrip,
  reorderDestinations,
} from "../services/tripService";

// --- React-Leaflet stand-ins: record what would be drawn on the map. ---
const { mapApi, openPopup } = vi.hoisted(() => ({
  mapApi: {
    setView: vi.fn(),
    fitBounds: vi.fn(),
    getCenter: vi.fn(() => ({ lat: 40, lng: 0 })),
    getZoom: vi.fn(() => 6),
  },
  openPopup: vi.fn(),
}));

vi.mock("react-leaflet", () => ({
  useMap: () => mapApi,
  Marker: forwardRef(function Marker({ position, title, icon, children, eventHandlers }, ref) {
    useImperativeHandle(ref, () => ({ openPopup: () => openPopup(title) }));
    return (
      <div
        data-testid="marker"
        data-title={title}
        data-latlng={position.join(",")}
        data-icon={icon?.options?.html ?? ""}
        onClick={() => eventHandlers?.click?.()}
      >
        {children}
      </div>
    );
  }),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  Polyline: ({ positions, pathOptions }) => (
    <div
      data-testid={pathOptions.dashArray ? "route" : "route-casing"}
      data-positions={positions.map((p) => p.join(",")).join(" > ")}
    />
  ),
}));

// The destination dialog's place search needs the network; here it submits
// a fixed place so add/edit go through the real itinerary code.
const { dialogValues } = vi.hoisted(() => ({ dialogValues: { current: null } }));
vi.mock("./DestinationDialog", () => ({
  default: ({ onSubmit }) => (
    <button type="button" onClick={() => onSubmit(dialogValues.current)}>
      stub-save-destination
    </button>
  ),
}));

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner" }, profile: { role: "user" } }),
}));
vi.mock("../contexts/CitiesContext", () => ({ useCities: () => ({ cities: [] }) }));
vi.mock("../contexts/tripsContext", () => ({
  useTrips: () => ({ upsertTrip: vi.fn(), removeTrip: vi.fn() }),
}));
vi.mock("../hooks/useTripPhotoUrls", () => ({
  useTripPhotoUrls: () => ({ urls: {}, error: "" }),
}));
vi.mock("../services/tripService", async (importOriginal) => ({
  ...(await importOriginal()),
  getTrip: vi.fn(),
  addDestination: vi.fn(),
  updateDestination: vi.fn(),
  deleteDestination: vi.fn(),
  reorderDestinations: vi.fn(),
}));

const dest = (id, sortOrder, city, lat, lng, extra = {}) => ({
  id,
  tripId: "t1",
  cityId: null,
  cityName: city,
  country: "Portugal",
  countryCode: "PT",
  region: "",
  position: { lat, lng },
  sortOrder,
  arrivalDate: null,
  departureDate: null,
  notes: "",
  ...extra,
});

const lisbon = dest("d1", 0, "Lisbon", 38.72, -9.14, {
  arrivalDate: "2025-03-01",
  departureDate: "2025-03-04",
  notes: "Tram 28 at sunrise",
});
const porto = dest("d2", 1, "Porto", 41.15, -8.61);
const faro = dest("d3", 2, "Faro", 37.02, -7.93);

const makeTrip = (id, destinations, title = `Trip ${id}`) => ({
  id,
  userId: "owner",
  title,
  description: "",
  startDate: "2025-03-01",
  endDate: null,
  status: "active",
  destinations,
  photos: [],
});

const markers = () => screen.queryAllByTestId("marker");
const markerTitles = () => markers().map((m) => m.dataset.title);

function renderLayer(props = {}) {
  const handlers = { onSelectDestination: vi.fn(), onShowInItinerary: vi.fn() };
  const all = {
    trip: makeTrip("t1", [lisbon, porto, faro]),
    activeDestinationId: null,
    focusRequest: null,
    shouldRestoreView: () => true,
    ...handlers,
    ...props,
  };
  const utils = render(<TripMapLayer {...all} />);
  return { ...utils, ...handlers, rerenderWith: (next) => utils.rerender(<TripMapLayer {...all} {...next} />) };
}

beforeEach(() => {
  Object.values(mapApi).forEach((fn) => fn.mockClear());
  openPopup.mockClear();
});
afterEach(cleanup);

describe("TripMapLayer", () => {
  it("shows numbered markers, the route in itinerary order and fits all stops", () => {
    // Deliberately out of order: the itinerary order (sortOrder) wins.
    renderLayer({ trip: makeTrip("t1", [faro, lisbon, porto]) });

    expect(markerTitles()).toEqual(["Stop 1: Lisbon", "Stop 2: Porto", "Stop 3: Faro"]);
    expect(markers()[0].dataset.icon).toContain(">1<");
    expect(screen.getByTestId("route").dataset.positions).toBe(
      "38.72,-9.14 > 41.15,-8.61 > 37.02,-7.93",
    );
    expect(screen.getAllByTestId("route-casing")).toHaveLength(1);

    expect(mapApi.fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, options] = mapApi.fitBounds.mock.calls[0];
    expect(bounds.getSouthWest()).toMatchObject({ lat: 37.02, lng: -9.14 });
    expect(bounds.getNorthEast()).toMatchObject({ lat: 41.15, lng: -7.93 });
    expect(options.maxZoom).toBe(11);
    expect(options.paddingTopLeft).toBeTruthy();
  });

  it("puts the destination's details in its popup", () => {
    renderLayer();
    const popup = within(markers()[0]).getByTestId("popup");
    expect(popup.textContent).toContain("Lisbon");
    expect(popup.textContent).toContain("Portugal");
    expect(popup.textContent).toContain("Stop 1 of 3 · Trip t1");
    expect(popup.textContent).toContain("Mar 1");
    expect(popup.textContent).toContain("Tram 28 at sunrise");
  });

  it("centres on a trip with a single destination, without a route", () => {
    renderLayer({ trip: makeTrip("t1", [porto]) });
    expect(markers()).toHaveLength(1);
    expect(screen.queryByTestId("route")).toBeNull();
    expect(mapApi.setView).toHaveBeenCalledWith([41.15, -8.61], 10, expect.any(Object));
    expect(mapApi.fitBounds).not.toHaveBeenCalled();
  });

  it("leaves out stops without valid coordinates and never routes through them", () => {
    const broken = dest("dx", 1, "Nowhere", NaN, 12);
    const missing = { ...dest("dy", 3, "Lost", 0, 0), position: null };
    renderLayer({
      trip: makeTrip("t1", [lisbon, broken, { ...porto, sortOrder: 2 }, missing, { ...faro, sortOrder: 4 }]),
    });

    expect(markerTitles()).toEqual(["Stop 1: Lisbon", "Stop 3: Porto", "Stop 5: Faro"]);
    // Lisbon | Nowhere | Porto | Lost | Faro: no two mapped stops are adjacent.
    expect(screen.queryByTestId("route")).toBeNull();
    const [bounds] = mapApi.fitBounds.mock.calls[0];
    expect(bounds.getNorthEast().lat).toBe(41.15);
  });

  it("draws nothing and doesn't move the map when no stop can be mapped", () => {
    renderLayer({ trip: makeTrip("t1", [{ ...lisbon, position: null }]) });
    expect(markers()).toHaveLength(0);
    expect(mapApi.fitBounds).not.toHaveBeenCalled();
    expect(mapApi.setView).not.toHaveBeenCalled();
  });

  it("focuses a stop on request and opens its popup; null fits the whole route", () => {
    const { rerenderWith } = renderLayer();
    mapApi.fitBounds.mockClear();

    rerenderWith({ focusRequest: { destinationId: "d2", n: 1 }, activeDestinationId: "d2" });
    expect(mapApi.setView).toHaveBeenCalledWith([41.15, -8.61], 9, expect.any(Object));
    expect(openPopup).toHaveBeenCalledWith("Stop 2: Porto");
    expect(markers()[1].dataset.icon).toMatch(/stopActive/);
    expect(markers()[0].dataset.icon).not.toMatch(/stopActive/);

    rerenderWith({ focusRequest: { destinationId: null, n: 2 } });
    expect(mapApi.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("reports marker clicks and 'Show in itinerary'", () => {
    const { onSelectDestination, onShowInItinerary } = renderLayer();
    fireEvent.click(markers()[2]);
    expect(onSelectDestination).toHaveBeenCalledWith("d3");
    fireEvent.click(within(markers()[0]).getByRole("button", { name: "Show in itinerary" }));
    expect(onShowInItinerary).toHaveBeenCalledWith("d1");
  });

  it("switching trips replaces every marker and route, and refits", () => {
    const { rerenderWith } = renderLayer();
    expect(mapApi.fitBounds).toHaveBeenCalledTimes(1);

    const madrid = dest("e1", 0, "Madrid", 40.42, -3.7);
    const seville = dest("e2", 1, "Seville", 37.39, -5.98);
    rerenderWith({ trip: makeTrip("t2", [madrid, seville]) });

    expect(markerTitles()).toEqual(["Stop 1: Madrid", "Stop 2: Seville"]);
    expect(screen.getAllByTestId("route")).toHaveLength(1);
    expect(screen.getByTestId("route").dataset.positions).toBe("40.42,-3.7 > 37.39,-5.98");
    expect(mapApi.fitBounds).toHaveBeenCalledTimes(2);
  });

  it("reordering updates numbers and route without moving the map; new places refit", () => {
    const { rerenderWith } = renderLayer();
    mapApi.fitBounds.mockClear();

    rerenderWith({
      trip: makeTrip("t1", [{ ...porto, sortOrder: 0 }, { ...lisbon, sortOrder: 1 }, faro]),
    });
    expect(markerTitles()).toEqual(["Stop 1: Porto", "Stop 2: Lisbon", "Stop 3: Faro"]);
    expect(screen.getByTestId("route").dataset.positions.startsWith("41.15,-8.61")).toBe(true);
    expect(mapApi.fitBounds).not.toHaveBeenCalled();

    rerenderWith({ trip: makeTrip("t1", [lisbon, porto, faro, dest("d4", 3, "Braga", 41.55, -8.42)]) });
    expect(markers()).toHaveLength(4);
    expect(mapApi.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("puts the previous view back when the trip closes, unless the next page sets its own", () => {
    const first = renderLayer();
    first.unmount();
    expect(mapApi.setView).toHaveBeenLastCalledWith({ lat: 40, lng: 0 }, 6, { animate: false });

    mapApi.setView.mockClear();
    const second = renderLayer({ shouldRestoreView: () => false });
    second.unmount();
    expect(mapApi.setView).not.toHaveBeenCalled();
  });
});

// ---------------- Trip page <-> map state ----------------

function Probe() {
  const { mapTrip, focusRequest, activeDestinationId, revealDestination } = useTripMap();
  return (
    <div>
      <p data-testid="map-trip">
        {mapTrip
          ? `${mapTrip.id}:${[...mapTrip.destinations]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((d) => d.cityName)
              .join(",")}`
          : "none"}
      </p>
      <p data-testid="focus">{focusRequest ? `${focusRequest.destinationId ?? "route"}` : ""}</p>
      <p data-testid="active">{activeDestinationId ?? ""}</p>
      <button type="button" onClick={() => revealDestination("d2")}>
        probe-reveal
      </button>
    </div>
  );
}

function Nav() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/app/trips/t2")}>go-t2</button>
      <button type="button" onClick={() => navigate("/app/trips")}>go-list</button>
    </>
  );
}

function renderTripPage(path = "/app/trips/t1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TripMapProvider>
        <Routes>
          <Route path="/app/trips/:id" element={<TripDetail />} />
          <Route path="/app/trips" element={<p>trip list</p>} />
        </Routes>
        <Probe />
        <Nav />
      </TripMapProvider>
    </MemoryRouter>,
  );
}

const mapTripText = () => screen.getByTestId("map-trip").textContent;

describe("Trip page and map stay in sync", () => {
  beforeEach(() => {
    vi.mocked(getTrip).mockReset();
    vi.mocked(addDestination).mockReset();
    vi.mocked(deleteDestination).mockReset();
    vi.mocked(reorderDestinations).mockReset();
  });

  it("shows the opened trip on the map and restores the normal map on leaving", async () => {
    vi.mocked(getTrip).mockResolvedValue(makeTrip("t1", [lisbon, porto, faro]));
    renderTripPage();
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon,Porto,Faro"));

    fireEvent.click(screen.getByRole("button", { name: "go-list" }));
    await screen.findByText("trip list");
    expect(mapTripText()).toBe("none");
  });

  it("switching trips never shows the previous trip while the next loads", async () => {
    let resolveT2;
    vi.mocked(getTrip).mockImplementation((id) =>
      id === "t1"
        ? Promise.resolve(makeTrip("t1", [lisbon, porto]))
        : new Promise((resolve) => (resolveT2 = resolve)),
    );
    renderTripPage();
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon,Porto"));

    fireEvent.click(screen.getByRole("button", { name: "go-t2" }));
    await waitFor(() => expect(mapTripText()).toBe("none"));

    await act(async () => resolveT2(makeTrip("t2", [faro])));
    await waitFor(() => expect(mapTripText()).toBe("t2:Faro"));
  });

  it("keeps the map's trip in step with adding, removing and reordering destinations", async () => {
    vi.mocked(getTrip).mockResolvedValue(makeTrip("t1", [lisbon, porto]));
    vi.mocked(reorderDestinations).mockResolvedValue();
    vi.mocked(deleteDestination).mockResolvedValue();
    renderTripPage();
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon,Porto"));

    fireEvent.click(screen.getByRole("button", { name: "Move Porto earlier" }));
    await waitFor(() => expect(mapTripText()).toBe("t1:Porto,Lisbon"));

    fireEvent.click(screen.getByRole("button", { name: "Remove Porto" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon"));
  });

  it("adds and edits destinations on the map's trip", async () => {
    vi.mocked(getTrip).mockResolvedValue(makeTrip("t1", [lisbon]));
    vi.mocked(addDestination).mockResolvedValue({ ...faro, sortOrder: 1 });
    renderTripPage();
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon"));

    dialogValues.current = { cityName: "Faro", position: faro.position };
    fireEvent.click(screen.getByRole("button", { name: "+ Add destination" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-save-destination" }));
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon,Faro"));
    expect(addDestination).toHaveBeenCalled();

    const { updateDestination } = await import("../services/tripService");
    vi.mocked(updateDestination).mockResolvedValue({ ...faro, sortOrder: 1, cityName: "Lagos", position: { lat: 37.1, lng: -8.67 } });
    fireEvent.click(screen.getByRole("button", { name: "Edit Faro" }));
    fireEvent.click(screen.getByRole("button", { name: "stub-save-destination" }));
    await waitFor(() => expect(mapTripText()).toBe("t1:Lisbon,Lagos"));
  });

  it("a stop's name focuses it on the map and highlights it in the itinerary", async () => {
    vi.mocked(getTrip).mockResolvedValue(makeTrip("t1", [lisbon, porto]));
    renderTripPage();
    const button = await screen.findByRole("button", { name: "Show Porto, stop 2, on the map" });
    fireEvent.click(button);
    expect(screen.getByTestId("focus").textContent).toBe("d2");
    expect(screen.getByTestId("active").textContent).toBe("d2");
    expect(button.closest("li").className).toMatch(/active/);

    fireEvent.click(screen.getByRole("button", { name: "Show route on map" }));
    expect(screen.getByTestId("focus").textContent).toBe("route");
  });

  it("'Show in itinerary' from the map moves focus to the stop", async () => {
    vi.mocked(getTrip).mockResolvedValue(makeTrip("t1", [lisbon, porto]));
    renderTripPage();
    const portoButton = await screen.findByRole("button", { name: "Show Porto, stop 2, on the map" });
    fireEvent.click(screen.getByRole("button", { name: "probe-reveal" }));
    await waitFor(() => expect(document.activeElement).toBe(portoButton));
  });

  it("explains stops that can't be mapped and offers no map link for them", async () => {
    vi.mocked(getTrip).mockResolvedValue(
      makeTrip("t1", [lisbon, { ...porto, position: { lat: null, lng: null } }]),
    );
    renderTripPage();
    await screen.findByText(/1 of 2 stops can't be shown on the map/);
    expect(screen.getByText("Not on the map: no valid location.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show Porto/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Show Lisbon, stop 1, on the map" })).toBeTruthy();
  });

  it("an empty itinerary offers no route button", async () => {
    vi.mocked(getTrip).mockResolvedValue(makeTrip("t1", []));
    renderTripPage();
    await screen.findByText("No destinations yet");
    expect(screen.queryByRole("button", { name: "Show route on map" })).toBeNull();
    expect(mapTripText()).toBe("t1:");
  });

  it("a trip that fails to load leaves the normal map", async () => {
    vi.mocked(getTrip).mockRejectedValue(new Error("This trip doesn't exist, or you don't have access to it."));
    renderTripPage();
    await screen.findByText("This trip doesn't exist, or you don't have access to it.");
    expect(mapTripText()).toBe("none");
  });
});
