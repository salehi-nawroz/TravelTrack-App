import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CitiesProvider, useCities } from "./CitiesContext";
import { useAuth } from "./AuthContext";
import { getCity, getMyCities } from "../services/cityService";

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../services/cityService", () => ({
  getMyCities: vi.fn(),
  getCity: vi.fn(),
  createCity: vi.fn(),
  updateCity: vi.fn(),
  trashCity: vi.fn(),
  restoreCity: vi.fn(),
}));

const city = (id, cityName) => ({ id, cityName, createdAt: "2025-01-01" });
let api;

function Probe() {
  api = useCities();
  return (
    <p>
      cities: {api.cities.map((c) => c.cityName).join(",") || "none"} | current:{" "}
      {api.currentCity.cityName ?? "none"}
    </p>
  );
}

const renderAs = (user) => {
  vi.mocked(useAuth).mockReturnValue({ user });
  return render(
    <CitiesProvider>
      <Probe />
    </CitiesProvider>,
  );
};
const rerenderAs = (rerender, user) => {
  vi.mocked(useAuth).mockReturnValue({ user });
  rerender(
    <CitiesProvider>
      <Probe />
    </CitiesProvider>,
  );
};

beforeEach(() => {
  vi.mocked(getMyCities).mockReset();
  vi.mocked(getCity).mockReset();
});
afterEach(cleanup);

describe("CitiesProvider across sign-out / sign-in", () => {
  it("forgets the previous user's cities and open city", async () => {
    vi.mocked(getMyCities).mockResolvedValue([city("a1", "Lisbon")]);
    vi.mocked(getCity).mockResolvedValue(city("a1", "Lisbon"));
    const { rerender } = renderAs({ id: "user-a" });
    await screen.findByText(/cities: Lisbon/);
    await act(() => api.getCity("a1"));
    expect(screen.getByText(/current: Lisbon/)).toBeTruthy();

    rerenderAs(rerender, null);
    expect(screen.getByText("cities: none | current: none")).toBeTruthy();

    // The next user asking for the same id goes to the server (where RLS
    // hides it) instead of being shown the cached city.
    vi.mocked(getMyCities).mockResolvedValue([city("b1", "Oslo")]);
    vi.mocked(getCity).mockRejectedValue(new Error("not found"));
    rerenderAs(rerender, { id: "user-b" });
    await screen.findByText(/cities: Oslo/);
    await act(() => api.getCity("a1"));
    expect(getCity).toHaveBeenLastCalledWith("a1");
    expect(screen.getByText(/current: none/)).toBeTruthy();
  });

  it("ignores a slow response for a user who has since signed out", async () => {
    let resolveA;
    vi.mocked(getMyCities).mockImplementation(() => new Promise((r) => (resolveA = r)));
    const { rerender } = renderAs({ id: "user-a" });
    rerenderAs(rerender, null);
    await act(async () => resolveA([city("a1", "Lisbon")]));
    expect(screen.getByText("cities: none | current: none")).toBeTruthy();
  });
});
