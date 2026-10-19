import { describe, expect, it } from "vitest";
import { getTripMapData, isValidPosition, placesKey } from "./tripMap";

const stop = (id, sortOrder, lat, lng) => ({
  id,
  sortOrder,
  cityName: id,
  position: lat === undefined ? undefined : { lat, lng },
});

describe("isValidPosition", () => {
  it("accepts real coordinates only", () => {
    expect(isValidPosition({ lat: 38.7, lng: -9.1 })).toBe(true);
    expect(isValidPosition({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidPosition({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidPosition(undefined)).toBe(false);
    expect(isValidPosition({ lat: null, lng: 2 })).toBe(false);
    expect(isValidPosition({ lat: "38.7", lng: "-9.1" })).toBe(false);
    expect(isValidPosition({ lat: NaN, lng: 2 })).toBe(false);
    expect(isValidPosition({ lat: 91, lng: 2 })).toBe(false);
    expect(isValidPosition({ lat: 10, lng: -181 })).toBe(false);
  });
});

describe("getTripMapData", () => {
  it("orders by itinerary position and numbers the stops", () => {
    const data = getTripMapData([stop("b", 1, 41, -8), stop("a", 0, 38, -9), stop("c", 2, 40, -3)]);
    expect(data.points.map((p) => [p.destination.id, p.number])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(data.segments).toEqual([[[38, -9], [41, -8], [40, -3]]]);
    expect(data.total).toBe(3);
    expect(data.unmapped).toEqual([]);
  });

  it("keeps itinerary numbers and breaks the route at stops without a location", () => {
    const data = getTripMapData([
      stop("a", 0, 38, -9),
      stop("b", 1, 41, -8),
      stop("x", 2),
      stop("c", 3, 40, -3),
      stop("d", 4, 37, -6),
    ]);
    expect(data.points.map((p) => p.number)).toEqual([1, 2, 4, 5]);
    expect(data.segments).toEqual([
      [[38, -9], [41, -8]],
      [[40, -3], [37, -6]],
    ]);
    expect(data.unmapped.map((d) => d.id)).toEqual(["x"]);
  });

  it("draws no route through a lone mapped stop", () => {
    const data = getTripMapData([stop("a", 0, 38, -9), stop("x", 1, 999, 0), stop("c", 2, 40, -3)]);
    expect(data.points).toHaveLength(2);
    expect(data.segments).toEqual([]);
  });

  it("handles empty and single-stop itineraries", () => {
    expect(getTripMapData([])).toEqual({ points: [], segments: [], unmapped: [], total: 0 });
    const one = getTripMapData([stop("a", 0, 38, -9)]);
    expect(one.points).toHaveLength(1);
    expect(one.segments).toEqual([]);
  });
});

describe("placesKey", () => {
  it("ignores order but notices added, removed or moved places", () => {
    const pts = (...coords) => coords.map((latlng) => ({ latlng }));
    expect(placesKey("t", pts([1, 2], [3, 4]))).toBe(placesKey("t", pts([3, 4], [1, 2])));
    expect(placesKey("t", pts([1, 2]))).not.toBe(placesKey("t", pts([1, 2], [3, 4])));
    expect(placesKey("t", pts([1, 2]))).not.toBe(placesKey("t", pts([1, 3])));
    expect(placesKey("t", pts([1, 2]))).not.toBe(placesKey("u", pts([1, 2])));
  });
});
