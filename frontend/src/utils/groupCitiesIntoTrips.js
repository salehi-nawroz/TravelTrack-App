import { compareDates } from "./compareDates";

// Visits closer together than this are treated as the same trip.
export const TRIP_GAP_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Derives trips from the user's already-loaded cities until trips are stored
// in their own table: cities sorted by visit date, with a new trip started
// whenever the gap to the previous visit exceeds TRIP_GAP_DAYS. Cities with
// no valid date are left out. Returns newest trip first.
export function groupCitiesIntoTrips(cities, gapDays = TRIP_GAP_DAYS) {
  const datedCities = cities
    .filter((city) => city.date && !Number.isNaN(new Date(city.date).getTime()))
    .sort((a, b) => compareDates(a.date, b.date));

  const trips = [];

  for (const city of datedCities) {
    const lastTrip = trips.at(-1);
    const gap = lastTrip
      ? (new Date(city.date) - new Date(lastTrip.endDate)) / MS_PER_DAY
      : Infinity;

    if (gap > gapDays) {
      trips.push({
        id: city.id,
        startDate: city.date,
        endDate: city.date,
        cities: [city],
      });
    } else {
      lastTrip.cities.push(city);
      lastTrip.endDate = city.date;
    }
  }

  return trips.reverse();
}
