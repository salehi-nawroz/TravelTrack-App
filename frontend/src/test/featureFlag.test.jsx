import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Flag-off must leave the app exactly as before: no Trips admin tab and no
// queries to the trip tables. Each test loads the modules fresh with the
// flag value it needs (TRIPS_ENABLED is read when the modules load).

const getAllTrips = vi.fn();
const getMyTrips = vi.fn();

function mockApp(tripsEnabled) {
  vi.doMock("../config/features", () => ({ TRIPS_ENABLED: tripsEnabled }));
  vi.doMock("../services/supabaseClient", () => import("./supabaseMock"));
  vi.doMock("../contexts/AuthContext", () => ({
    useAuth: () => ({
      user: { id: "s1" },
      profile: { role: "super_admin" },
      isLoading: false,
      isProfileLoading: false,
      isAdmin: false,
      isSuperAdmin: true,
    }),
  }));
  vi.doMock("../services/profileService", () => ({
    getAllProfiles: vi.fn().mockResolvedValue([]),
    getAdminUsers: vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("../services/cityService", () => ({
    getCities: vi.fn().mockResolvedValue([]),
    deleteCity: vi.fn(),
  }));
  vi.doMock("../services/tripService", async (importOriginal) => ({
    ...(await importOriginal()),
    getAllTrips,
    getMyTrips,
  }));
}

beforeEach(() => {
  vi.resetModules();
  getAllTrips.mockReset().mockResolvedValue([]);
  getMyTrips.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.doUnmock("../config/features");
});

async function renderAdmin() {
  const { default: Admin } = await import("../pages/Admin");
  render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
  await screen.findByRole("tab", { name: /Users/ });
}

async function renderProvider() {
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
}

describe("VITE_TRIPS_ENABLED off (current live setting)", () => {
  beforeEach(() => mockApp(false));

  it("shows only the existing Admin tabs and never loads trips", async () => {
    await renderAdmin();
    expect(screen.getAllByRole("tab").map((t) => t.textContent.replace(/\d+$/, ""))).toEqual([
      "Users",
      "Cities",
    ]);
    expect(getAllTrips).not.toHaveBeenCalled();
  });

  it("TripsProvider never queries the trip tables", async () => {
    await renderProvider();
    expect((await screen.findByTestId("probe")).textContent).toBe("trips:0");
    expect(getMyTrips).not.toHaveBeenCalled();
  });
});

describe("VITE_TRIPS_ENABLED on", () => {
  beforeEach(() => mockApp(true));

  it("adds the Trips admin tab and loads trips", async () => {
    await renderAdmin();
    expect(screen.getByRole("tab", { name: /Trips/ })).toBeTruthy();
    await waitFor(() => expect(getAllTrips).toHaveBeenCalledTimes(1));
  });

  it("TripsProvider loads the user's trips", async () => {
    await renderProvider();
    await waitFor(() => expect(getMyTrips).toHaveBeenCalledTimes(1));
  });
});
