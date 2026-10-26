import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TripDetailsForm from "./TripDetailsForm";
import Trips from "./Trips";
import TripGallery from "./TripGallery";
import AdminTrips from "./AdminTrips";
import { useTrips } from "../contexts/tripsContext";
import { deleteTripPhoto } from "../services/tripPhotoService";
import { deleteTrip } from "../services/tripService";

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../contexts/tripsContext", () => ({ useTrips: vi.fn() }));
vi.mock("../hooks/useTripPhotoUrls", () => ({
  useTripPhotoUrls: () => ({ urls: {}, error: "" }),
}));
vi.mock("../services/tripPhotoService", async (importOriginal) => ({
  ...(await importOriginal()),
  deleteTripPhoto: vi.fn(),
  setTripCover: vi.fn(),
  uploadTripPhoto: vi.fn(),
}));
vi.mock("../services/tripService", async (importOriginal) => ({
  ...(await importOriginal()),
  deleteTrip: vi.fn(),
}));

const makeTrip = (overrides = {}) => ({
  id: "trip-1",
  userId: "owner",
  title: "Portugal",
  description: "",
  startDate: "2025-03-03",
  endDate: "2025-03-10",
  status: "completed",
  createdAt: "2025-03-01T00:00:00Z",
  updatedAt: "2025-03-11T00:00:00Z",
  destinations: [],
  photos: [],
  ...overrides,
});

const photo = (id, isCover = false) => ({
  id,
  tripId: "trip-1",
  userId: "owner",
  storagePath: `owner/trip-1/${id}.jpg`,
  isCover,
  caption: "",
});

const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  vi.mocked(deleteTripPhoto).mockReset();
  vi.mocked(deleteTrip).mockReset();
});

afterEach(cleanup);

describe("TripDetailsForm", () => {
  it("shows validation errors and doesn't submit", async () => {
    const onSubmit = vi.fn();
    render(<TripDetailsForm mode="edit" initial={{ startDate: "2025-03-05" }} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2025-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Give your trip a title.")).toBeTruthy();
    expect(screen.getByText("The end date can't be before the start date.")).toBeTruthy();
    expect(screen.getByLabelText("Trip title").getAttribute("aria-invalid")).toBe("true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits once even when clicked repeatedly", async () => {
    let finish;
    const onSubmit = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    render(<TripDetailsForm mode="create" onSubmit={onSubmit} submitLabel="Start trip" busyLabel="Starting…" />);

    fireEvent.change(screen.getByLabelText("Trip title"), { target: { value: "  Lisbon " } });
    const button = screen.getByRole("button", { name: "Start trip" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "Starting…" }).disabled).toBe(true));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual(expect.objectContaining({ title: "Lisbon", endDate: null }));
    finish();
  });

  it("shows the error the save throws and lets the user retry", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("You already have an active trip."));
    render(<TripDetailsForm mode="create" onSubmit={onSubmit} submitLabel="Start trip" />);

    fireEvent.change(screen.getByLabelText("Trip title"), { target: { value: "Lisbon" } });
    fireEvent.click(screen.getByRole("button", { name: "Start trip" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "You already have an active trip.");
    expect(screen.getByRole("button", { name: "Start trip" }).disabled).toBe(false);
  });

  it("rejects an unsupported cover photo", () => {
    render(<TripDetailsForm mode="create" onSubmit={vi.fn()} />);
    const input = screen.getByLabelText("Cover photo (optional)");
    fireEvent.change(input, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    expect(screen.getByText("Please choose a JPEG, PNG or WEBP image.")).toBeTruthy();
  });
});

describe("Trips list", () => {
  const contextValue = (overrides) => ({
    trips: [],
    isLoading: false,
    error: "",
    activeTrip: null,
    reload: vi.fn(),
    ...overrides,
  });

  it("shows an empty state with a Start a Trip link", () => {
    vi.mocked(useTrips).mockReturnValue(contextValue());
    renderWithRouter(<Trips />);
    expect(screen.getByText("No trips yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "+ Start a Trip" }).getAttribute("href")).toBe("/app/trips/new");
  });

  it("blocks starting a second active trip and filters by status", () => {
    const active = makeTrip({ id: "a", title: "Japan", status: "active", endDate: null });
    const done = makeTrip({ id: "b", title: "Portugal" });
    vi.mocked(useTrips).mockReturnValue(contextValue({ trips: [active, done], activeTrip: active }));
    renderWithRouter(<Trips />);

    const start = screen.getByRole("button", { name: "+ Start a Trip" });
    expect(start.disabled).toBe(true);
    expect(screen.getByText("Japan")).toBeTruthy();
    expect(screen.getByText("Portugal")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Completed/ }));
    expect(screen.queryByText("Japan")).toBeNull();
    expect(screen.getByText("Portugal")).toBeTruthy();
  });

  it("offers a retry when loading fails", () => {
    const reload = vi.fn();
    vi.mocked(useTrips).mockReturnValue(contextValue({ error: "Couldn't load your trips.", reload }));
    renderWithRouter(<Trips />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reload).toHaveBeenCalled();
  });
});

describe("TripGallery", () => {
  it("only offers uploads to the owner", () => {
    const trip = makeTrip({ photos: [photo("a")] });
    const { rerender } = render(
      <TripGallery trip={trip} canUpload={false} canManage canDelete onTripChange={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "+ Add photos" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete photo 1" })).toBeTruthy();

    rerender(<TripGallery trip={trip} canUpload canManage canDelete onTripChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Add photos" })).toBeTruthy();
  });

  it("lets a plain admin set the cover but never delete a photo", () => {
    // TripDetail passes canManage without canDelete for a plain admin.
    render(
      <TripGallery trip={makeTrip({ photos: [photo("a", true), photo("b")] })} canUpload={false} canManage onTripChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Make photo 2 the cover" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Delete photo/ })).toBeNull();
  });

  it("hides cover and delete controls from viewers who can't manage", () => {
    render(
      <TripGallery trip={makeTrip({ photos: [photo("a")] })} canUpload={false} canManage={false} onTripChange={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /Delete photo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /cover/ })).toBeNull();
  });

  it("asks before deleting a photo, then removes it", async () => {
    const onTripChange = vi.fn();
    const trip = makeTrip({ photos: [photo("a", true), photo("b")] });
    vi.mocked(deleteTripPhoto).mockResolvedValue();
    render(<TripGallery trip={trip} canUpload canManage canDelete onTripChange={onTripChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete photo 1" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("cover photo");
    expect(deleteTripPhoto).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(onTripChange).toHaveBeenCalled());
    expect(deleteTripPhoto).toHaveBeenCalledWith(trip.photos[0]);
    expect(onTripChange.mock.calls[0][0].photos.map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps the photo and shows an error when deletion fails", async () => {
    const onTripChange = vi.fn();
    vi.mocked(deleteTripPhoto).mockRejectedValue(new Error("Couldn't delete this photo. Please try again."));
    render(<TripGallery trip={makeTrip({ photos: [photo("a")] })} canUpload canManage canDelete onTripChange={onTripChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete photo 1" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete photo" }));

    expect(await screen.findByText("Couldn't delete this photo. Please try again.")).toBeTruthy();
    expect(onTripChange).not.toHaveBeenCalled();
  });
});

describe("AdminTrips", () => {
  const profiles = [
    { id: "u1", full_name: "Una User", role: "user" },
    { id: "a2", full_name: "Ada Admin", role: "admin" },
    { id: "s1", full_name: "Sam Super", role: "super_admin" },
  ];
  const trips = [
    makeTrip({ id: "t-user", userId: "u1", title: "User trip" }),
    makeTrip({ id: "t-admin", userId: "a2", title: "Admin trip" }),
    makeTrip({ id: "t-super", userId: "s1", title: "Super trip" }),
  ];
  const renderAdmin = (viewer, props = {}) =>
    renderWithRouter(
      <AdminTrips
        trips={trips}
        isLoading={false}
        error=""
        onRetry={vi.fn()}
        onTripDeleted={vi.fn()}
        profiles={profiles}
        viewer={viewer}
        {...props}
      />,
    );

  it("never offers a plain admin a trip delete, but still lets them open and edit", () => {
    renderAdmin({ id: "admin-1", role: "admin" });
    expect(screen.queryByRole("button", { name: /^Delete / })).toBeNull();
    expect(screen.getByRole("link", { name: "Open User trip" }).textContent).toBe("Open / edit");
    expect(screen.getByRole("link", { name: "Open Admin trip" }).textContent).toBe("Open / edit");
  });

  it("lets a super admin delete any trip", () => {
    renderAdmin({ id: "s2", role: "super_admin" });
    expect(screen.getByRole("button", { name: "Delete User trip, owned by Una User" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Admin trip, owned by Ada Admin" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete Super trip/ })).toBeTruthy();
  });

  it("names the trip and its owner before deleting", async () => {
    const onTripDeleted = vi.fn();
    vi.mocked(deleteTrip).mockResolvedValue();
    renderAdmin({ id: "s2", role: "super_admin" }, { onTripDeleted });

    fireEvent.click(screen.getByRole("button", { name: "Delete User trip, owned by Una User" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("User trip");
    expect(dialog.textContent).toContain("Una User");
    expect(deleteTrip).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete trip" }));
    await waitFor(() => expect(onTripDeleted).toHaveBeenCalledWith("t-user"));
    expect(deleteTrip).toHaveBeenCalledWith(trips[0], "s2");
  });

  it("filters by owner and search text", () => {
    renderAdmin({ id: "s2", role: "super_admin" });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "a2" } });
    expect(screen.queryByText("User trip")).toBeNull();
    expect(screen.getByText("Admin trip")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "una" } });
    expect(screen.getByText("User trip")).toBeTruthy();
    expect(screen.queryByText("Admin trip")).toBeNull();
  });

  it("shows loading, error and retry states", () => {
    const onRetry = vi.fn();
    const { rerender } = renderAdmin({ id: "s2", role: "super_admin" }, { isLoading: true });
    expect(screen.getByText("Loading trips…")).toBeTruthy();

    rerender(
      <MemoryRouter>
        <AdminTrips
          trips={[]}
          isLoading={false}
          error="Couldn't load trips."
          onRetry={onRetry}
          onTripDeleted={vi.fn()}
          profiles={profiles}
          viewer={{ id: "s2", role: "super_admin" }}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
