import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getNavItems } from "../components/navItems";

// Trip tracking is a permanent part of the app: no build-time switch decides
// whether the Trips section, the admin Trips tab or the trip queries exist.

const getAllTrips = vi.fn();
const getMyTrips = vi.fn();

vi.mock("../services/supabaseClient", () => import("./supabaseMock"));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "s1" },
    profile: { role: "super_admin" },
    isLoading: false,
    isProfileLoading: false,
    isAdmin: false,
    isSuperAdmin: true,
  }),
}));
vi.mock("../services/profileService", () => ({
  getAllProfiles: vi.fn().mockResolvedValue([]),
  getAdminUsers: vi.fn().mockResolvedValue([]),
}));
vi.mock("../services/cityService", () => ({
  getCities: vi.fn().mockResolvedValue([]),
  deleteCity: vi.fn(),
}));
vi.mock("../services/tripService", async (importOriginal) => ({
  ...(await importOriginal()),
  getAllTrips: (...args) => getAllTrips(...args),
  getMyTrips: (...args) => getMyTrips(...args),
}));

beforeEach(() => {
  getAllTrips.mockReset().mockResolvedValue([]);
  getMyTrips.mockReset().mockResolvedValue([]);
});

afterEach(cleanup);

describe("trip tracking is always available", () => {
  it("offers Trips in the main navigation for every signed-in user", () => {
    for (const options of [{}, { showAdmin: true }, { includeProfile: true }]) {
      const trips = getNavItems(options).find((item) => item.id === "trips");
      expect(trips).toMatchObject({ to: "trips", label: "Trips" });
      expect(trips.group).toBeUndefined();
    }
  });

  it("shows the Trips admin tab and loads trips", async () => {
    const { default: Admin } = await import("../pages/Admin");
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    await screen.findByRole("tab", { name: /Users/ });
    expect(screen.getAllByRole("tab").map((t) => t.textContent.replace(/\d+$/, ""))).toEqual([
      "Users",
      "Cities",
      "Trips",
    ]);
    await waitFor(() => expect(getAllTrips).toHaveBeenCalledTimes(1));
  });

  it("TripsProvider loads the signed-in user's trips", async () => {
    const { default: TripsProvider } = await import("../contexts/TripsProvider");
    const { useTrips } = await import("../contexts/tripsContext");
    function Probe() {
      const { isLoading, trips } = useTrips();
      return <p data-testid="probe">{isLoading ? "loading" : `trips:${trips.length}`}</p>;
    }
    render(
      <TripsProvider>
        <Probe />
      </TripsProvider>,
    );
    await waitFor(() => expect(getMyTrips).toHaveBeenCalledTimes(1));
    expect((await screen.findByTestId("probe")).textContent).toBe("trips:0");
  });
});
