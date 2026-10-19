import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { MemoryRouter } from "react-router-dom";
import PageNav from "../components/PageNav";
import Homepage from "./Homepage";
import Explore from "./Explore";
import { SAMPLE_CITIES, SAMPLE_TRIPS, getSampleStats } from "../data/exploreSample";

// NOTE: services/supabaseClient is deliberately NOT mocked here. Without
// VITE_SUPABASE_URL, creating the client throws, so if Home, Explore or the
// sample data ever imported a Supabase service, this file would fail to
// load - the public pages must stay data-free.

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  ZoomControl: () => null,
  GeoJSON: () => null,
  useMap: () => ({
    setView: vi.fn(),
    fitBounds: vi.fn(),
    getCenter: () => ({ lat: 0, lng: 0 }),
    getZoom: () => 2,
  }),
  Marker: forwardRef(function Marker({ title, children }, ref) {
    useImperativeHandle(ref, () => ({ openPopup: () => {}, getElement: () => null }));
    return <div data-testid="marker" data-title={title}>{children}</div>;
  }),
  Popup: ({ children }) => <div>{children}</div>,
  Polyline: () => <div data-testid="route" />,
}));
vi.mock("../components/MapAutoResize", () => ({ default: () => null }));
vi.mock("../components/StatsMap", () => ({
  default: ({ countryCodes }) => <div data-testid="stats-map">{[...countryCodes].sort().join(",")}</div>,
}));

const renderAt = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const stopMarkers = () =>
  screen.queryAllByTestId("marker").filter((m) => m.dataset.title?.startsWith("Stop "));

afterEach(cleanup);

describe("public navigation", () => {
  it("offers Home, Explore and Login - and no Pricing or Product", () => {
    renderAt(<PageNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    expect(within(nav).getByRole("link", { name: "Explore" }).getAttribute("href")).toBe("/explore");
    expect(within(nav).getByRole("link", { name: "Login" }).getAttribute("href")).toBe("/login");
    expect(within(nav).queryByRole("link", { name: /pricing|product/i })).toBeNull();
  });
});

describe("sample data", () => {
  it("is self-consistent and fictional", () => {
    expect(SAMPLE_TRIPS.length).toBe(5);
    expect(SAMPLE_CITIES.length).toBe(SAMPLE_TRIPS.reduce((n, t) => n + t.destinations.length, 0));
    for (const city of SAMPLE_CITIES) {
      expect(city.position.lat).toBeGreaterThanOrEqual(-90);
      expect(city.position.lat).toBeLessThanOrEqual(90);
      expect(Math.abs(city.position.lng)).toBeLessThanOrEqual(180);
    }
    const stats = getSampleStats();
    expect(stats.countriesVisited).toBe(9);
    expect(stats.citiesVisited).toBe(20);
    expect(stats.tripCount).toBe(5);
    expect(stats.continents).toBeGreaterThanOrEqual(3);
  });
});

describe("Home page", () => {
  it("leads to Login (primary) and Explore (secondary)", () => {
    renderAt(<Homepage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("One map.");
    const start = screen.getByRole("link", { name: "Start tracking" });
    const demo = screen.getAllByRole("link", { name: "Explore the demo" })[0];
    expect(start.getAttribute("href")).toBe("/login");
    expect(start.className).toMatch(/primary/);
    expect(demo.getAttribute("href")).toBe("/explore");
  });

  it("highlights the features and previews the map, cities, trips and stats", () => {
    renderAt(<Homepage />);
    for (const title of ["Your world map", "Cities and memories", "Trips with routes", "Travel statistics"]) {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    }
    expect(screen.getByRole("region", { name: /Preview map of the sample Iberian rail loop trip/ })).toBeTruthy();
    expect(stopMarkers()).toHaveLength(4);
    expect(screen.getByText("Recent cities")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Visits per year in the sample data" })).toBeTruthy();
  });
});

describe("Explore demo", () => {
  it("works without signing in and says it's sample data", () => {
    renderAt(<Explore />);
    expect(screen.getByRole("heading", { level: 1, name: /Explore a traveller/ })).toBeTruthy();
    expect(screen.getByText(/Sample data only/).textContent).toContain("nothing you do here is saved");
    expect(screen.getAllByRole("link", { name: /Log in/ })[0].getAttribute("href")).toBe("/login");
  });

  it("shows the sample statistics", () => {
    renderAt(<Explore />);
    const stats = within(screen.getByRole("region", { name: "Travel statistics" }));
    expect(stats.getByText("Countries").previousSibling.textContent).toBe("9");
    expect(stats.getByText("Cities").previousSibling.textContent).toBe("20");
    expect(stats.getByText("Trips").previousSibling.textContent).toBe("5");
    expect(screen.getByTestId("stats-map").textContent).toBe("AR,CL,ES,HR,JP,ME,PT,SI,TR");
  });

  it("shows the first trip's route and switches trips", () => {
    renderAt(<Explore />);
    expect(stopMarkers().map((m) => m.dataset.title)).toEqual([
      "Stop 1: Lisbon",
      "Stop 2: Porto",
      "Stop 3: Salamanca",
      "Stop 4: Madrid",
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Balkan road trip/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Balkan road trip" })).toBeTruthy();
    expect(stopMarkers()).toHaveLength(6);
    expect(screen.getByRole("button", { name: /Balkan road trip/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("highlights a stop picked in the itinerary", () => {
    renderAt(<Explore />);
    const porto = screen.getByRole("button", { name: "Show Porto, stop 2, on the map" });
    fireEvent.click(porto);
    expect(porto.closest("li").className).toMatch(/activeStop/);
  });

  it("'All places' lists every city by country and jumps to its trip", () => {
    renderAt(<Explore />);
    fireEvent.click(screen.getByRole("button", { name: /All places/ }));
    expect(screen.getByRole("heading", { name: "Every place visited" })).toBeTruthy();
    expect(screen.getAllByTestId("marker")).toHaveLength(20);
    expect(stopMarkers()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Show Kyoto on the Autumn in Japan route" }));
    expect(screen.getByRole("heading", { level: 2, name: "Autumn in Japan" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Show Kyoto, stop 3, on the map" }).closest("li").className,
    ).toMatch(/activeStop/);
  });
});
