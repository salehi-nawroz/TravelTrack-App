import { describe, expect, it } from "vitest";
import { formatTripRange, isIsoDate, tripLengthDays } from "./tripDates";
import {
  hasErrors,
  latestDeparture,
  validateDestination,
  validateTrip,
} from "./tripValidation";
import { canManageTrip, canUploadTripPhotos } from "./tripPermissions";

describe("tripDates", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28/02/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  // ICU puts thin/narrow spaces around the range dash; compare plain text.
  const plain = (text) => text.replace(/\s/g, " ");

  it("formats ranges without shifting days", () => {
    expect(plain(formatTripRange("2025-03-03", "2025-03-09"))).toBe("Mar 3 – 9, 2025");
    expect(plain(formatTripRange("2025-02-28", "2025-03-04"))).toBe("Feb 28 – Mar 4, 2025");
    expect(plain(formatTripRange("2024-12-30", "2025-01-02"))).toBe(
      "Dec 30, 2024 – Jan 2, 2025",
    );
    expect(formatTripRange("2025-03-03", "2025-03-03")).toBe("Mar 3, 2025");
    expect(formatTripRange("2025-03-03", null)).toBe("Since Mar 3, 2025");
  });

  it("counts both the first and last day", () => {
    expect(tripLengthDays("2025-03-03", "2025-03-03")).toBe(1);
    expect(tripLengthDays("2025-03-03", "2025-03-09")).toBe(7);
  });
});

describe("validateTrip", () => {
  const valid = { title: "Lisbon", description: "", startDate: "2025-03-03" };

  it("requires a title and a valid start date", () => {
    expect(validateTrip({ ...valid, title: "   " })).toHaveProperty("title");
    expect(validateTrip({ ...valid, startDate: "" })).toHaveProperty("startDate");
    expect(hasErrors(validateTrip(valid))).toBe(false);
  });

  it("rejects an end date before the start", () => {
    expect(validateTrip({ ...valid, endDate: "2025-03-02" })).toHaveProperty("endDate");
    expect(hasErrors(validateTrip({ ...valid, endDate: "2025-03-03" }))).toBe(false);
  });

  it("requires an end date when ending a trip", () => {
    expect(validateTrip(valid, { requireEndDate: true })).toHaveProperty("endDate");
  });

  it("keeps the end date between the last departure and the latest allowed day", () => {
    const options = { earliestEndDate: "2025-03-08", latestEndDate: "2025-03-20" };
    expect(validateTrip({ ...valid, endDate: "2025-03-07" }, options).endDate).toMatch(
      /last departure/,
    );
    expect(validateTrip({ ...valid, endDate: "2025-03-21" }, options).endDate).toMatch(
      /future/,
    );
    expect(hasErrors(validateTrip({ ...valid, endDate: "2025-03-08" }, options))).toBe(false);
    expect(hasErrors(validateTrip({ ...valid, endDate: "2025-03-20" }, options))).toBe(false);
  });

  it("finds the latest departure in an itinerary", () => {
    expect(
      latestDeparture([
        { departureDate: "2025-03-05" },
        { departureDate: null },
        { departureDate: "2025-03-09" },
      ]),
    ).toBe("2025-03-09");
    expect(latestDeparture([{ departureDate: null }])).toBeUndefined();
  });

  it("enforces the database length limits", () => {
    expect(validateTrip({ ...valid, title: "x".repeat(121) })).toHaveProperty("title");
    expect(validateTrip({ ...valid, description: "x".repeat(2001) })).toHaveProperty(
      "description",
    );
  });
});

describe("validateDestination", () => {
  const trip = { startDate: "2025-03-03", endDate: "2025-03-10" };
  const place = {
    cityName: "Porto",
    country: "Portugal",
    countryCode: "PT",
    position: { lat: 41.15, lng: -8.61 },
  };

  it("requires a place", () => {
    expect(validateDestination({}, trip)).toHaveProperty("place");
    expect(hasErrors(validateDestination(place, trip))).toBe(false);
  });

  it("keeps dates in order and inside the trip", () => {
    expect(
      validateDestination({ ...place, arrivalDate: "2025-03-05", departureDate: "2025-03-04" }, trip),
    ).toHaveProperty("departureDate");
    expect(validateDestination({ ...place, arrivalDate: "2025-03-01" }, trip)).toHaveProperty(
      "arrivalDate",
    );
    expect(validateDestination({ ...place, departureDate: "2025-03-11" }, trip)).toHaveProperty(
      "departureDate",
    );
  });

  it("only bounds by the start while a trip is active", () => {
    const active = { startDate: "2025-03-03", endDate: null };
    expect(hasErrors(validateDestination({ ...place, arrivalDate: "2025-04-01" }, active))).toBe(
      false,
    );
  });
});

describe("trip permissions (UI mirror of can_manage_trips_of)", () => {
  const trip = { id: "t1", userId: "owner" };

  it("lets the owner manage and upload", () => {
    const owner = { id: "owner", role: "user" };
    expect(canManageTrip(trip, owner)).toBe(true);
    expect(canUploadTripPhotos(trip, owner)).toBe(true);
  });

  it("never lets another regular user manage", () => {
    expect(canManageTrip(trip, { id: "other", role: "user" }, "user")).toBe(false);
  });

  it("lets an admin manage trips of users and other admins only", () => {
    const admin = { id: "admin-1", role: "admin" };
    expect(canManageTrip(trip, admin, "user")).toBe(true);
    expect(canManageTrip(trip, admin, "admin")).toBe(true);
    expect(canManageTrip(trip, admin, "super_admin")).toBe(false);
    // Unknown owner role fails closed.
    expect(canManageTrip(trip, admin, undefined)).toBe(false);
  });

  it("lets a super admin manage any trip", () => {
    expect(canManageTrip(trip, { id: "s", role: "super_admin" }, "super_admin")).toBe(true);
  });

  it("only lets the owner upload, even for admins", () => {
    expect(canUploadTripPhotos(trip, { id: "s", role: "super_admin" })).toBe(false);
    expect(canUploadTripPhotos(trip, { id: "admin-1", role: "admin" })).toBe(false);
  });
});
