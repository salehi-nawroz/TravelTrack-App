/* eslint-env node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import CollapsibleFilters from "./CollapsibleFilters";
import CityList from "./CityList";
import GlobalSearch from "./GlobalSearch";
import LocationSearch from "./LocationSearch";

// jsdom doesn't evaluate CSS (let alone container queries), so behaviour is
// tested here through the toggle's state and the panel's class, and the
// breakpoint rules themselves are checked in the stylesheet at the end.

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false, isSuperAdmin: false }),
}));

const lisbon = {
  id: "c1",
  cityName: "Lisbon",
  country: "Portugal",
  countryCode: "PT",
  date: new Date(2024, 4, 1),
  position: { lat: 38.7, lng: -9.1 },
};
const kyoto = {
  id: "c2",
  cityName: "Kyoto",
  country: "Japan",
  countryCode: "JP",
  date: new Date(2023, 9, 3),
  position: { lat: 35, lng: 135.7 },
};
vi.mock("../contexts/CitiesContext", () => ({
  useCities: () => ({ cities: [lisbon, kyoto], isLoading: false, currentCity: {}, deleteCity: vi.fn() }),
}));

afterEach(cleanup);

const isOpen = (toggle) => toggle.getAttribute("aria-expanded") === "true";
const panelOf = (toggle) => document.getElementById(toggle.getAttribute("aria-controls"));

// A parent holding the field's value, like the real toolbars.
function Toolbar({ name }) {
  const [query, setQuery] = useState("");
  return (
    <CollapsibleFilters label={`${name} filters`} activeCount={query ? 1 : 0}>
      <label htmlFor={`${name}-q`}>{name} search</label>
      <input id={`${name}-q`} value={query} onChange={(e) => setQuery(e.target.value)} />
    </CollapsibleFilters>
  );
}

describe("CollapsibleFilters", () => {
  it("starts closed, with an accessible toggle that never submits", () => {
    render(
      <form onSubmit={() => { throw new Error("submitted"); }}>
        <Toolbar name="Cities" />
      </form>,
    );
    const toggle = screen.getByRole("button", { name: "Cities filters" });
    expect(toggle.type).toBe("button");
    expect(isOpen(toggle)).toBe(false);
    expect(panelOf(toggle)).toBeTruthy();
    expect(panelOf(toggle).className).not.toMatch(/open/);
    fireEvent.click(toggle); // would throw if it submitted the form
  });

  it("opens and closes, moving focus to the first field on open", () => {
    render(<Toolbar name="Cities" />);
    const toggle = screen.getByRole("button", { name: "Cities filters" });

    fireEvent.click(toggle);
    expect(isOpen(toggle)).toBe(true);
    expect(panelOf(toggle).className).toMatch(/open/);
    expect(document.activeElement).toBe(screen.getByLabelText("Cities search"));

    fireEvent.click(toggle);
    expect(isOpen(toggle)).toBe(false);
    expect(panelOf(toggle).className).not.toMatch(/open/);
  });

  it("keeps the search when closed and reopened, and shows it on the toggle", () => {
    render(<Toolbar name="Cities" />);
    const toggle = screen.getByRole("button", { name: "Cities filters" });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Cities search"), { target: { value: "lis" } });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Cities search").value).toBe("lis");
    expect(screen.getByRole("button", { name: "Cities filters 1 active" })).toBe(toggle);
  });

  it("opens and closes each area independently", () => {
    render(
      <>
        <Toolbar name="Cities" />
        <Toolbar name="Users" />
      </>,
    );
    const cities = screen.getByRole("button", { name: "Cities filters" });
    const users = screen.getByRole("button", { name: "Users filters" });
    expect(cities.getAttribute("aria-controls")).not.toBe(users.getAttribute("aria-controls"));

    fireEvent.click(cities);
    expect(isOpen(cities)).toBe(true);
    expect(isOpen(users)).toBe(false);
    fireEvent.click(users);
    fireEvent.click(cities);
    expect(isOpen(cities)).toBe(false);
    expect(isOpen(users)).toBe(true);
  });
});

describe("Cities list toolbar", () => {
  it("keeps filtering while the panel is closed", () => {
    render(
      <MemoryRouter>
        <CityList />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: "Search & filter" });
    const panel = panelOf(toggle);
    for (const label of ["Search", "Country", "Visited", "Sort"]) {
      expect(within(panel).getByLabelText(label)).toBeTruthy();
    }

    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "kyo" } });
    fireEvent.click(toggle);

    expect(screen.getByText("1 of 2 cities")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search & filter 1 active" })).toBe(toggle);
    expect(screen.getByLabelText("Search").value).toBe("kyo");

    // The count and Clear stay outside the panel, so they're always visible.
    const clear = screen.getByRole("button", { name: "Clear" });
    expect(panel.contains(clear)).toBe(false);
    fireEvent.click(clear);
    expect(screen.getByText("2 cities")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search & filter" })).toBe(toggle);
  });
});

describe("Sidebar search", () => {
  it("folds away once a result is picked, and keeps an unfinished query", () => {
    render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: "Search" });
    fireEvent.click(toggle);
    const input = screen.getByLabelText("Global search");
    expect(document.activeElement).toBe(input);

    fireEvent.change(input, { target: { value: "kyo" } });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Global search").value).toBe("kyo");

    fireEvent.click(screen.getByRole("button", { name: /Kyoto/ }));
    expect(isOpen(toggle)).toBe(false);
  });
});

describe("map search", () => {
  it("is not collapsible", () => {
    const { container } = render(<LocationSearch variant="map" onSelect={() => {}} />);
    expect(container.querySelector("[aria-expanded]")).toBeNull();
    expect(container.querySelector("[data-filters-panel]")).toBeNull();
    expect(screen.getByLabelText("Search for a city or country")).toBeTruthy();
  });
});

describe("rendering", () => {
  it("renders its fields exactly once, inside one wrapper", () => {
    const { container } = render(<Toolbar name="Cities" />);
    expect(screen.getAllByLabelText("Cities search")).toHaveLength(1);
    expect(container.querySelectorAll("[data-filters-panel]")).toHaveLength(1);
    expect(container.children).toHaveLength(1);
  });
});

// Real layouts were checked in a browser (see the task report); these keep
// the rules that make them work from regressing.
describe("breakpoint rules (CollapsibleFilters.module.css)", () => {
  const css = readFileSync(resolve(__dirname, "CollapsibleFilters.module.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ");
  const [wide, narrow] = css.split("@container (max-width: 55.98rem)");

  it("never stretches: full width with no flex basis, in a row or a column parent", () => {
    expect(wide).toContain(".root { flex: 0 0 auto; width: 100%; min-width: 0; }");
    expect(css).not.toMatch(/flex: 1 1 100%/);
    expect(css).not.toMatch(/display: contents/);
  });

  it("on a wide sidebar: no toggle, fields in the toolbar's own wrapping row", () => {
    expect(wide).toContain(".toggle { display: none; }");
    expect(wide).toMatch(/\.panel \{ display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1\.2rem;/);
  });

  it("on a narrow sidebar: the toggle shows, a closed panel is hidden, an open one stacks", () => {
    expect(narrow).toMatch(/\.toggle \{ display: inline-flex;[^}]*max-width: 100%;/);
    expect(narrow).toContain(".panel { display: none; }");
    expect(narrow).toMatch(/\.panel\.open \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/);
  });
});
