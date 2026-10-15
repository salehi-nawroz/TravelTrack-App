import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import TripForm from "./TripForm";
import DestinationPlacePicker from "./DestinationPlacePicker";
import { useTrips } from "../contexts/tripsContext";
import { useCities } from "../contexts/CitiesContext";
import { addDestination } from "../services/tripService";
import { uploadTripPhoto } from "../services/tripPhotoService";

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/tripsContext", () => ({ useTrips: vi.fn() }));
vi.mock("../contexts/CitiesContext", () => ({ useCities: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner" }, profile: { role: "user" } }),
}));
vi.mock("../services/tripService", async (importOriginal) => ({
  ...(await importOriginal()),
  addDestination: vi.fn(),
}));
vi.mock("../services/tripPhotoService", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadTripPhoto: vi.fn(),
  setTripCover: vi.fn(),
}));

const lisbon = {
  id: "city-lisbon",
  cityName: "Lisbon",
  country: "Portugal",
  countryCode: "PT",
  region: "",
  position: { lat: 38.7, lng: -9.1 },
  date: new Date(2025, 2, 1),
};
const newTrip = {
  id: "trip-9",
  userId: "owner",
  title: "Portugal",
  description: "",
  startDate: "2025-03-01",
  endDate: null,
  status: "active",
  destinations: [],
  photos: [],
};

// Shows where StartTrip navigated, and the notice it handed over.
function TripPage() {
  const location = useLocation();
  return (
    <p data-testid="trip-page">
      {location.pathname}|{location.state?.notice ?? ""}
    </p>
  );
}

function renderStart() {
  return render(
    <MemoryRouter initialEntries={["/app/trips/new"]}>
      <Routes>
        <Route path="/app/trips/new" element={<TripForm />} />
        <Route path="/app/trips/:id" element={<TripPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const createTrip = vi.fn();
const upsertTrip = vi.fn();

beforeEach(() => {
  createTrip.mockReset().mockResolvedValue(newTrip);
  upsertTrip.mockReset();
  vi.mocked(addDestination).mockReset();
  vi.mocked(uploadTripPhoto).mockReset();
  vi.mocked(useTrips).mockReturnValue({ activeTrip: null, isLoading: false, createTrip, upsertTrip });
  vi.mocked(useCities).mockReturnValue({ cities: [lisbon] });
});

afterEach(cleanup);

function fillAndPickLisbon() {
  fireEvent.change(screen.getByLabelText("Trip title"), { target: { value: "Portugal" } });
  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2025-03-01" } });
  fireEvent.change(screen.getByLabelText("City"), { target: { value: "city-lisbon" } });
}

describe("Start a trip with a first destination", () => {
  it("creates the trip, then adds the first destination arriving on the start date", async () => {
    const destination = { id: "d1", cityName: "Lisbon", sortOrder: 0 };
    vi.mocked(addDestination).mockResolvedValue(destination);
    renderStart();

    fillAndPickLisbon();
    expect(screen.getByText("Lisbon", { selector: "strong" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start trip" }));

    const page = await screen.findByTestId("trip-page");
    expect(page.textContent).toBe("/app/trips/trip-9|");
    expect(createTrip).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Portugal", startDate: "2025-03-01" }),
    );
    expect(addDestination).toHaveBeenCalledWith(
      newTrip,
      expect.objectContaining({
        cityId: "city-lisbon",
        cityName: "Lisbon",
        countryCode: "PT",
        arrivalDate: "2025-03-01",
      }),
    );
    expect(upsertTrip).toHaveBeenCalledWith({ ...newTrip, destinations: [destination] });
  });

  it("starts the trip without a destination when none is chosen", async () => {
    renderStart();
    fireEvent.change(screen.getByLabelText("Trip title"), { target: { value: "Portugal" } });
    fireEvent.click(screen.getByRole("button", { name: "Start trip" }));

    await screen.findByTestId("trip-page");
    expect(createTrip).toHaveBeenCalled();
    expect(addDestination).not.toHaveBeenCalled();
  });

  it("keeps the started trip and explains when the destination can't be added", async () => {
    vi.mocked(addDestination).mockRejectedValue(new Error("Couldn't add this destination."));
    renderStart();

    fillAndPickLisbon();
    fireEvent.click(screen.getByRole("button", { name: "Start trip" }));

    const page = await screen.findByTestId("trip-page");
    expect(page.textContent).toContain("/app/trips/trip-9|");
    expect(page.textContent).toContain("the first destination wasn't added");
  });

  it("doesn't offer the form while another trip is active", () => {
    vi.mocked(useTrips).mockReturnValue({
      activeTrip: { id: "a", title: "Japan" },
      isLoading: false,
      createTrip,
      upsertTrip,
    });
    renderStart();
    expect(screen.getByText("You already have an active trip")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start trip" })).toBeNull();
  });
});

describe("DestinationPlacePicker", () => {
  it("offers only a new place when there are no cities", () => {
    render(<DestinationPlacePicker cities={[]} place={null} onPlaceChange={vi.fn()} />);
    expect(screen.queryByLabelText("From your cities")).toBeNull();
    expect(screen.getByLabelText("Search for a city or country")).toBeTruthy();
    expect(screen.getByText(/isn't added to your Cities/)).toBeTruthy();
  });

  it("passes the chosen city and lets the choice be cleared", () => {
    const onPlaceChange = vi.fn();
    const onClear = vi.fn();
    const { rerender } = render(
      <DestinationPlacePicker cities={[lisbon]} place={null} onPlaceChange={onPlaceChange} onClear={onClear} />,
    );
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "city-lisbon" } });
    const [place, city] = onPlaceChange.mock.calls[0];
    expect(place).toEqual({
      cityId: "city-lisbon",
      cityName: "Lisbon",
      country: "Portugal",
      countryCode: "PT",
      region: "",
      position: { lat: 38.7, lng: -9.1 },
    });
    expect(city).toBe(lisbon);

    rerender(
      <DestinationPlacePicker cities={[lisbon]} place={place} onPlaceChange={onPlaceChange} onClear={onClear} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Lisbon" }));
    expect(onClear).toHaveBeenCalled();
  });
});
