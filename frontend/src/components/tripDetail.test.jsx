import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TripDetail from "./TripDetail";
import { endTrip, getTrip } from "../services/tripService";
import { todayIso } from "../utils/tripDates";

import { mockState, resetSupabaseMock } from "../test/supabaseMock";

const OWNER_AUTH = { user: { id: "owner" }, profile: { role: "user" } };
const auth = vi.hoisted(() => ({ current: null }));

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => auth.current,
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
  endTrip: vi.fn(),
}));

const activeTrip = (destinations = []) => ({
  id: "t1",
  userId: "owner",
  title: "Iberia",
  description: "",
  startDate: "2025-03-01",
  endDate: null,
  status: "active",
  destinations,
  photos: [],
});

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/app/trips/t1"]}>
      <Routes>
        <Route path="/app/trips/:id" element={<TripDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openEndDialog() {
  fireEvent.click(await screen.findByRole("button", { name: "End trip" }));
  return screen.getByRole("dialog");
}

const setEndDate = (dialog, value) =>
  fireEvent.change(within(dialog).getByLabelText("End date"), { target: { value } });

beforeEach(() => {
  vi.mocked(getTrip).mockReset();
  vi.mocked(endTrip).mockReset();
  resetSupabaseMock();
  auth.current = OWNER_AUTH;
});

afterEach(cleanup);

describe("End trip", () => {
  it("defaults to today and ends the trip", async () => {
    vi.mocked(getTrip).mockResolvedValue(activeTrip());
    vi.mocked(endTrip).mockResolvedValue({ ...activeTrip(), endDate: todayIso(), status: "completed" });
    renderDetail();

    const dialog = await openEndDialog();
    expect(within(dialog).getByLabelText("End date").value).toBe(todayIso());
    fireEvent.click(within(dialog).getByRole("button", { name: "End trip" }));

    await waitFor(() => expect(endTrip).toHaveBeenCalledWith("t1", todayIso()));
    expect(await screen.findByText("Completed")).toBeTruthy();
  });

  it("rejects an end date in the future", async () => {
    vi.mocked(getTrip).mockResolvedValue(activeTrip());
    renderDetail();

    const dialog = await openEndDialog();
    setEndDate(dialog, "2999-01-01");
    fireEvent.click(within(dialog).getByRole("button", { name: "End trip" }));

    expect(await within(dialog).findByText("The end date can't be in the future.")).toBeTruthy();
    expect(endTrip).not.toHaveBeenCalled();
  });

  it("rejects an end date before the start or before the last departure", async () => {
    vi.mocked(getTrip).mockResolvedValue(
      activeTrip([{ id: "d1", cityName: "Porto", country: "Portugal", countryCode: "PT", departureDate: "2025-03-09", sortOrder: 0, position: { lat: 0, lng: 0 } }]),
    );
    renderDetail();

    const dialog = await openEndDialog();
    setEndDate(dialog, "2025-02-01");
    fireEvent.click(within(dialog).getByRole("button", { name: "End trip" }));
    expect(await within(dialog).findByText("The end date can't be before the start date.")).toBeTruthy();

    setEndDate(dialog, "2025-03-08");
    fireEvent.click(within(dialog).getByRole("button", { name: "End trip" }));
    expect(
      await within(dialog).findByText("The end date can't be before the last departure in the itinerary."),
    ).toBeTruthy();
    expect(endTrip).not.toHaveBeenCalled();
  });

  it("shows the error and keeps the dialog open when saving fails", async () => {
    vi.mocked(getTrip).mockResolvedValue(activeTrip());
    vi.mocked(endTrip).mockRejectedValue(new Error("Couldn't end this trip."));
    renderDetail();

    const dialog = await openEndDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "End trip" }));

    expect(await within(dialog).findByText("Couldn't end this trip.")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "End trip" }).disabled).toBe(false);
  });

  it("is not offered for a completed trip", async () => {
    vi.mocked(getTrip).mockResolvedValue({ ...activeTrip(), endDate: "2025-03-10", status: "completed" });
    renderDetail();
    expect(await screen.findByText("Completed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "End trip" })).toBeNull();
  });
});

describe("Trip page errors", () => {
  it("shows an error with a retry when the trip can't be loaded", async () => {
    vi.mocked(getTrip)
      .mockRejectedValueOnce(new Error("This trip doesn't exist, or you don't have access to it."))
      .mockResolvedValueOnce(activeTrip());
    renderDetail();

    expect(await screen.findByText("This trip doesn't exist, or you don't have access to it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Iberia" })).toBeTruthy();
  });
});

describe("Delete controls by role", () => {
  const tripWithPhoto = () => ({
    ...activeTrip(),
    photos: [{ id: "p1", tripId: "t1", userId: "owner", storagePath: "owner/t1/p1.jpg", isCover: false, caption: "" }],
  });

  // The owner's profile, as an admin's RLS lets them read it.
  const ownerProfile = () => {
    mockState.handlers["profiles.select"] = () => ({
      data: { id: "owner", full_name: "Olive Owner", role: "user" },
      error: null,
    });
  };

  it("offers the owner Delete trip and photo deletion", async () => {
    vi.mocked(getTrip).mockResolvedValue(tripWithPhoto());
    renderDetail();
    expect(await screen.findByRole("button", { name: "Delete trip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete photo 1" })).toBeTruthy();
  });

  it("lets a plain admin edit a user's trip but never delete it or its photos", async () => {
    auth.current = { user: { id: "admin-1" }, profile: { role: "admin" } };
    ownerProfile();
    vi.mocked(getTrip).mockResolvedValue(tripWithPhoto());
    renderDetail();

    expect(await screen.findByText("Olive Owner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit details" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "End trip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make photo 1 the cover" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete trip" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete photo/ })).toBeNull();
  });

  it("offers a super admin Delete trip and photo deletion", async () => {
    auth.current = { user: { id: "super-1" }, profile: { role: "super_admin" } };
    ownerProfile();
    vi.mocked(getTrip).mockResolvedValue(tripWithPhoto());
    renderDetail();

    expect(await screen.findByText("Olive Owner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete trip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete photo 1" })).toBeTruthy();
  });
});
