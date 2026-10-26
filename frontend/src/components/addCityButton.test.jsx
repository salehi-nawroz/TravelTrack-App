import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppNav from "./AppNav";
import CityList from "./CityList";
import { isCitiesSection } from "./navItems";

const citiesState = vi.hoisted(() => ({ current: { cities: [], isLoading: false } }));

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: true, isSuperAdmin: false }),
}));
vi.mock("../contexts/CitiesContext", () => ({
  useCities: () => ({ ...citiesState.current, currentCity: {}, deleteCity: vi.fn() }),
}));

const lisbon = {
  id: "c1",
  cityName: "Lisbon",
  country: "Portugal",
  countryCode: "PT",
  date: new Date(2024, 4, 1),
  position: { lat: 38.7, lng: -9.1 },
};

const renderAt = (path, ui) => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

afterEach(cleanup);

describe("Add City button", () => {
  it("sits in the Cities page header, like Trips' Start a Trip", () => {
    citiesState.current = { cities: [lisbon], isLoading: false };
    renderAt("/app/cities", <CityList />);

    const header = screen.getByRole("heading", { level: 2, name: "Your cities" }).closest("header");
    const add = within(header).getByRole("link", { name: "+ Add City" });
    expect(add.getAttribute("href")).toBe("/app/form");
    expect(add.className).toMatch(/primary/);
    expect(add.className).toMatch(/sm/);
  });

  it("is offered in the empty state too", () => {
    citiesState.current = { cities: [], isLoading: false };
    renderAt("/app/cities", <CityList />);
    expect(screen.getByRole("link", { name: "+ Add City" }).getAttribute("href")).toBe("/app/form");
  });

  it("is not part of the sidebar section navigation", () => {
    renderAt("/app/cities", <AppNav />);
    expect(screen.queryByRole("link", { name: /Add city/i })).toBeNull();
  });

  it("isCitiesSection (the phone button's rule) matches only the Cities routes", () => {
    expect(isCitiesSection("/app/cities/c1/edit")).toBe(true);
    expect(isCitiesSection("/app/form?lat=1&lng=2")).toBe(true);
    expect(isCitiesSection("/app/countries")).toBe(false);
    expect(isCitiesSection("/app/stats")).toBe(false);
  });
});
