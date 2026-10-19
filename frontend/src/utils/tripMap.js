// What a trip contributes to the map, derived from its itinerary. Only real,
// stored coordinates are used: nothing is geocoded or guessed here.

export function isValidPosition(position) {
  const lat = position?.lat;
  const lng = position?.lng;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// {
//   points:   [{ destination, number, latlng }] for every destination with a
//             valid position, in itinerary order; `number` is the stop's
//             place in the whole itinerary (so it matches the list even
//             when an earlier stop can't be mapped)
//   segments: route lines, each a list of latlngs with at least two points.
//             A destination without a valid position breaks the route, so a
//             line never passes through a place that can't be shown.
//   unmapped: destinations without a valid position
//   total:    number of stops in the itinerary
// }
export function getTripMapData(destinations = []) {
  const ordered = [...destinations].sort((a, b) => a.sortOrder - b.sortOrder);
  const points = [];
  const unmapped = [];
  const segments = [];
  let current = [];

  ordered.forEach((destination, index) => {
    if (isValidPosition(destination.position)) {
      const latlng = [destination.position.lat, destination.position.lng];
      points.push({ destination, number: index + 1, latlng });
      current.push(latlng);
    } else {
      unmapped.push(destination);
      if (current.length > 1) segments.push(current);
      current = [];
    }
  });
  if (current.length > 1) segments.push(current);

  return { points, segments, unmapped, total: ordered.length };
}

// Stable key for "which places are on the map" - changes when a place is
// added, removed or moved, not when stops are only reordered.
export const placesKey = (tripId, points) =>
  `${tripId}|${points
    .map((p) => p.latlng.join(","))
    .sort()
    .join(";")}`;
