import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";
import { getCities, deleteCity } from "../services/cityService";
import { adminDeleteUser } from "../services/accountService";

const auth = vi.hoisted(() => ({ current: null }));

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth.current }));
vi.mock("../services/profileService", () => ({
  getAllProfiles: vi.fn(async () => [
    { id: "u1", full_name: "Una User", role: "user" },
    { id: "a2", full_name: "Abe Admin", role: "admin" },
  ]),
  getAdminUsers: vi.fn(async () => [
    { id: "u1", fullName: "Una User", email: "una@example.test", role: "user", avatarPath: null, createdAt: "2026-01-01" },
    { id: "a2", fullName: "Abe Admin", email: "abe@example.test", role: "admin", avatarPath: null, createdAt: "2026-01-02" },
  ]),
}));
vi.mock("../services/cityService", () => ({ getCities: vi.fn(), deleteCity: vi.fn() }));
vi.mock("../services/tripService", () => ({ getAllTrips: vi.fn(async () => []) }));
vi.mock("../services/accountService", () => ({ adminDeleteUser: vi.fn() }));

const city = (id, userId, cityName) => ({
  id,
  userId,
  cityName,
  country: "Portugal",
  countryCode: "PT",
  date: new Date(2026, 0, 1),
  createdAt: "2026-01-01T00:00:00Z",
  notes: "",
  region: null,
  deletedAt: null,
  position: { lat: 38.7, lng: -9.1 },
});

const asAdmin = { user: { id: "a1" }, profile: { role: "admin" }, isLoading: false, isProfileLoading: false, isAdmin: true, isSuperAdmin: false };
const asSuper = { user: { id: "s1" }, profile: { role: "super_admin" }, isLoading: false, isProfileLoading: false, isAdmin: false, isSuperAdmin: true };

function renderAdmin(tab = "cities") {
  return render(
    <MemoryRouter initialEntries={[`/app/admin?tab=${tab}`]}>
      <Admin />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.current = asAdmin;
  vi.mocked(getCities).mockResolvedValue([city("c1", "u1", "Lisbon"), city("c2", "a2", "Porto")]);
  vi.mocked(deleteCity).mockReset();
  vi.mocked(adminDeleteUser).mockReset();
});

afterEach(cleanup);

describe("Admin -> Cities: permanent delete", () => {
  it("is offered to a plain admin and removes the city after the server confirms", async () => {
    vi.mocked(deleteCity).mockResolvedValue();
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Delete Lisbon permanently" }));
    expect(screen.getByRole("button", { name: "Delete Porto permanently" })).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Una User");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete forever" }));

    await waitFor(() => expect(screen.queryByText("Lisbon")).toBeNull());
    expect(deleteCity).toHaveBeenCalledWith("c1");
    expect(screen.getByText("Porto")).toBeTruthy();
  });

  it("keeps the city and shows why when the delete fails", async () => {
    vi.mocked(deleteCity).mockRejectedValue(
      new Error("This city no longer exists, or you don't have permission to delete it."),
    );
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Delete Lisbon permanently" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete forever" }));

    expect(
      await screen.findByText(
        "Could not delete Lisbon. This city no longer exists, or you don't have permission to delete it.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Lisbon")).toBeTruthy();
  });

  it("is offered to a super admin", async () => {
    auth.current = asSuper;
    renderAdmin();
    expect(await screen.findByRole("button", { name: "Delete Lisbon permanently" })).toBeTruthy();
  });

  it("describes a plain admin's permissions accurately", async () => {
    renderAdmin();
    expect(await screen.findByText("Admin · read and edit; can delete users and cities, not trips")).toBeTruthy();
  });
});

describe("Admin -> Users: after deleting an account", () => {
  it("removes the user and their cities from the dashboard", async () => {
    vi.mocked(adminDeleteUser).mockResolvedValue({ warnings: [] });
    renderAdmin("users");

    fireEvent.click(await screen.findByRole("button", { name: /Una User/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /Una User/ })).toBeNull());
    expect(adminDeleteUser).toHaveBeenCalledWith("u1");

    fireEvent.click(screen.getByRole("tab", { name: /Cities/ }));
    expect(await screen.findByText("Porto")).toBeTruthy();
    expect(screen.queryByText("Lisbon")).toBeNull();
  });
});
