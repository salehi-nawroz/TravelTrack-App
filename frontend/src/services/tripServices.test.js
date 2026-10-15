import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockState, resetSupabaseMock } from "../test/supabaseMock";
import {
  buildPhotoPath,
  deleteTripPhotos,
  removeAllMyTripFiles,
  uploadTripPhoto,
  validateTripPhoto,
} from "./tripPhotoService";
import { createTrip, deleteTrip, getCoverPhoto, toDomainTrip } from "./tripService";
import { uploadWithProgress } from "./uploadWithProgress";

vi.mock("./supabaseClient", () => import("../test/supabaseMock"));
vi.mock("./uploadWithProgress", () => ({ uploadWithProgress: vi.fn() }));

const OWNER = "user-1";
const trip = { id: "trip-1", userId: OWNER, destinations: [], photos: [] };
const photoRow = (id) => ({
  id,
  trip_id: "trip-1",
  user_id: OWNER,
  storage_path: `${OWNER}/trip-1/${id}.jpg`,
  is_cover: false,
  content_type: "image/jpeg",
  size_bytes: 1000,
  created_at: "2025-03-03T10:00:00Z",
});
const file = (type = "image/jpeg", size = 1000) => ({ type, size, name: "photo.jpg" });

const callTypes = () =>
  mockState.calls.map((c) => (c.type === "query" ? `${c.table}.${c.op}` : c.type));

beforeEach(() => {
  resetSupabaseMock();
  vi.mocked(uploadWithProgress).mockReset().mockResolvedValue();
});

describe("photo validation and paths", () => {
  it("accepts JPEG, PNG and WEBP up to 5MB only", () => {
    expect(validateTripPhoto(file("image/jpeg"))).toBeNull();
    expect(validateTripPhoto(file("image/webp"))).toBeNull();
    expect(validateTripPhoto(file("image/gif"))).toMatch(/JPEG, PNG or WEBP/);
    expect(validateTripPhoto(file("image/heic"))).toMatch(/JPEG, PNG or WEBP/);
    expect(validateTripPhoto(file("image/png", 5 * 1024 * 1024 + 1))).toMatch(/5MB/);
    expect(validateTripPhoto(file("image/png", 0))).toMatch(/empty/);
  });

  it("builds the owner/trip/photo path the database check expects", () => {
    expect(buildPhotoPath("u", "t", "p", "image/png")).toBe("u/t/p.png");
    expect(buildPhotoPath("u", "t", "p", "image/jpeg")).toBe("u/t/p.jpg");
  });
});

describe("uploadTripPhoto", () => {
  it("uploads into the owner's folder, then records the photo", async () => {
    mockState.handlers["trip_photos.insert"] = (q) => ({
      data: { ...photoRow(q.payload.id), storage_path: q.payload.storage_path },
      error: null,
    });

    const photo = await uploadTripPhoto(trip, file());

    const { path } = vi.mocked(uploadWithProgress).mock.calls[0][0];
    expect(path).toMatch(new RegExp(`^${OWNER}/trip-1/[0-9a-f-]{36}\\.jpg$`));
    const insert = mockState.calls.find((c) => c.op === "insert");
    expect(insert.payload).toEqual(
      expect.objectContaining({ trip_id: "trip-1", storage_path: path, size_bytes: 1000 }),
    );
    // Ownership is never sent: the database fills user_id itself.
    expect(insert.payload).not.toHaveProperty("user_id");
    expect(photo.storagePath).toBe(path);
  });

  it("refuses to upload to someone else's trip", async () => {
    await expect(uploadTripPhoto({ ...trip, userId: "someone-else" }, file())).rejects.toThrow(
      /owner/,
    );
    expect(uploadWithProgress).not.toHaveBeenCalled();
  });

  it("rejects invalid files before uploading", async () => {
    await expect(uploadTripPhoto(trip, file("image/gif"))).rejects.toThrow();
    expect(uploadWithProgress).not.toHaveBeenCalled();
  });

  it("removes the uploaded file when the record can't be saved", async () => {
    mockState.handlers["trip_photos.insert"] = () => ({
      data: null,
      error: { code: "42501", message: "denied" },
    });

    await expect(uploadTripPhoto(trip, file())).rejects.toThrow(/couldn't be saved/);
    const { path } = vi.mocked(uploadWithProgress).mock.calls[0][0];
    expect(mockState.calls.at(-1)).toEqual(
      expect.objectContaining({ type: "storage.remove", paths: [path] }),
    );
  });

  it("surfaces upload errors without recording anything", async () => {
    vi.mocked(uploadWithProgress).mockRejectedValue(new Error("too large"));
    await expect(uploadTripPhoto(trip, file())).rejects.toThrow("too large");
    expect(callTypes()).not.toContain("trip_photos.insert");
  });
});

describe("deleteTripPhotos", () => {
  const photos = toDomainTrip({ ...trip, trip_photos: [photoRow("a"), photoRow("b")] }).photos;

  it("removes the files before deleting their records", async () => {
    mockState.handlers["trip_photos.delete"] = () => ({
      data: [{ id: "a" }, { id: "b" }],
      error: null,
    });

    const result = await deleteTripPhotos(photos);

    expect(callTypes()).toEqual(["storage.remove", "trip_photos.delete"]);
    expect(result).toEqual({ deletedIds: ["a", "b"], failed: [] });
  });

  it("keeps the record of any photo whose file is still stored", async () => {
    // The orphan-file trigger aborts the batch delete; one by one, "b" fails.
    mockState.handlers["trip_photos.delete"] = (q) => {
      const [type, , value] = q.filters[0];
      if (type === "in") return { data: null, error: { code: "23503", message: "file exists" } };
      return value === "b"
        ? { data: null, error: { code: "23503", message: "file exists" } }
        : { data: [{ id: value }], error: null };
    };

    const result = await deleteTripPhotos(photos);

    expect(result.deletedIds).toEqual(["a"]);
    expect(result.failed.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("deleteTrip", () => {
  it("deletes photos first and the trip last", async () => {
    mockState.handlers["trip_photos.select"] = () => ({ data: [photoRow("a")], error: null });
    mockState.handlers["trip_photos.delete"] = () => ({ data: [{ id: "a" }], error: null });
    mockState.handlers["trips.delete"] = () => ({ data: [{ id: "trip-1" }], error: null });

    await deleteTrip(trip, OWNER);

    const order = callTypes();
    expect(order.indexOf("storage.remove")).toBeLessThan(order.indexOf("trip_photos.delete"));
    expect(order.indexOf("trip_photos.delete")).toBeLessThan(order.indexOf("trips.delete"));
    expect(order.at(-1)).toBe("trips.delete");
  });

  it("keeps the trip when any photo can't be removed", async () => {
    mockState.handlers["trip_photos.select"] = () => ({ data: [photoRow("a")], error: null });
    mockState.handlers["trip_photos.delete"] = () => ({
      data: null,
      error: { code: "23503", message: "file exists" },
    });

    await expect(deleteTrip(trip, OWNER)).rejects.toThrow(/trip was kept/);
    expect(callTypes()).not.toContain("trips.delete");
  });

  it("only clears leftover folder files when the owner deletes", async () => {
    mockState.handlers["trips.delete"] = () => ({ data: [{ id: "trip-1" }], error: null });

    await deleteTrip(trip, "admin-1");
    expect(callTypes()).not.toContain("storage.list");

    resetSupabaseMock();
    mockState.handlers["trips.delete"] = () => ({ data: [{ id: "trip-1" }], error: null });
    await deleteTrip(trip, OWNER);
    expect(mockState.calls.find((c) => c.type === "storage.list").prefix).toBe(
      `${OWNER}/trip-1`,
    );
  });

  it("reports a trip RLS didn't let the caller delete", async () => {
    mockState.handlers["trips.delete"] = () => ({ data: [], error: null });
    await expect(deleteTrip(trip, "admin-1")).rejects.toThrow(/can't delete/);
  });
});

describe("createTrip", () => {
  it("never sends user_id and explains the one-active-trip rule", async () => {
    mockState.handlers["trips.insert"] = () => ({
      data: null,
      error: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "trips_one_active_per_user"',
      },
    });

    await expect(
      createTrip({ title: " Lisbon ", startDate: "2025-03-03" }),
    ).rejects.toThrow(/already have an active trip/);

    const insert = mockState.calls.find((c) => c.op === "insert");
    expect(insert.payload).toEqual({ title: "Lisbon", description: "", start_date: "2025-03-03" });
  });
});

describe("removeAllMyTripFiles (account deletion)", () => {
  it("removes every file in the user's folder", async () => {
    let removed = false;
    mockState.handlers["storage.list"] = (prefix) => {
      if (removed) return { data: [], error: null };
      if (prefix === OWNER) return { data: [{ name: "trip-1", id: null }], error: null };
      return { data: [{ name: "a.jpg", id: "obj-a" }], error: null };
    };
    mockState.handlers["storage.remove"] = (paths) => {
      removed = true;
      return { data: paths.map((name) => ({ name })), error: null };
    };

    await removeAllMyTripFiles(OWNER);
    expect(mockState.calls.find((c) => c.type === "storage.remove").paths).toEqual([
      `${OWNER}/trip-1/a.jpg`,
    ]);
  });

  it("throws (so the account is kept) when files remain", async () => {
    mockState.handlers["storage.list"] = (prefix) =>
      prefix === OWNER
        ? { data: [{ name: "trip-1", id: null }], error: null }
        : { data: [{ name: "a.jpg", id: "obj-a" }], error: null };

    await expect(removeAllMyTripFiles(OWNER)).rejects.toThrow(/wasn't deleted/);
  });
});

describe("getCoverPhoto", () => {
  it("prefers the chosen cover, then the first photo", () => {
    const withPhotos = toDomainTrip({
      ...trip,
      trip_photos: [photoRow("a"), { ...photoRow("b"), is_cover: true }],
    });
    expect(getCoverPhoto(withPhotos).id).toBe("b");
    expect(getCoverPhoto({ photos: [] })).toBeNull();
  });
});
