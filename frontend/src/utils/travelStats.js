import { groupCitiesIntoTrips } from "./groupCitiesIntoTrips";

// Number of sovereign states used as "the world" for the explored
// percentage: the 193 UN member states plus the 2 UN observer states
// (Vatican City and Palestine).
export const WORLD_COUNTRY_COUNT = 195;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidDate(date) {
  return date && !Number.isNaN(new Date(date).getTime());
}

// Prefer the ISO code; fall back to the country name for older rows that
// were saved without one, so they still count once.
function countryKey(city) {
  return city.countryCode?.toUpperCase() || city.country?.trim().toLowerCase();
}

// Same city recorded on several dates is one city, many visits.
function cityKey(city) {
  return `${city.cityName?.trim().toLowerCase()}|${countryKey(city)}`;
}

// Whole calendar days from start to end, both included. Math.round absorbs
// the hour lost or gained when a range crosses a DST change.
function daysInclusive(startDate, endDate) {
  return Math.round((new Date(endDate) - new Date(startDate)) / MS_PER_DAY) + 1;
}

// Every year from the first to the last visit, including years with no
// visits, so gaps show up as empty bars instead of disappearing.
function getVisitsPerYear(cities) {
  const counts = {};

  for (const city of cities) {
    if (!isValidDate(city.date)) continue;
    const year = new Date(city.date).getFullYear();
    counts[year] = (counts[year] ?? 0) + 1;
  }

  const years = Object.keys(counts).map(Number);
  if (!years.length) return [];

  const visitsPerYear = [];
  for (let year = Math.min(...years); year <= Math.max(...years); year++) {
    visitsPerYear.push({ year, visits: counts[year] ?? 0 });
  }

  return visitsPerYear;
}

// Trips aren't stored yet, so this reuses the Trips page grouping (visits
// within TRIP_GAP_DAYS of each other are one trip). A trip's length is
// therefore measured from its first to its last *recorded* visit, which can
// be shorter than the real journey. Ties go to the trip with more cities,
// then to the most recent one.
function getLongestTrip(cities) {
  const trips = groupCitiesIntoTrips(cities); // newest first

  let longest = null;

  for (const trip of trips) {
    const days = daysInclusive(trip.startDate, trip.endDate);

    if (
      !longest ||
      days > longest.days ||
      (days === longest.days && trip.cities.length > longest.cities.length)
    ) {
      longest = {
        ...trip,
        days,
        countries: [...new Set(trip.cities.map((city) => city.country))],
      };
    }
  }

  return longest;
}

export function getTravelStats(cities) {
  const countryCodes = new Set(
    cities.map((city) => city.countryCode?.toUpperCase()).filter(Boolean),
  );
  const countriesVisited = new Set(cities.map(countryKey).filter(Boolean)).size;
  const uniqueCities = new Map(cities.map((city) => [cityKey(city), city]));
  const citiesVisited = uniqueCities.size;

  const cityCountByCode = {};
  for (const city of uniqueCities.values()) {
    const code = city.countryCode?.toUpperCase();
    if (code) cityCountByCode[code] = (cityCountByCode[code] ?? 0) + 1;
  }

  return {
    countryCodes,
    cityCountByCode,
    countriesVisited,
    citiesVisited,
    totalVisits: cities.length,
    worldPercent: Math.min(100, (countriesVisited / WORLD_COUNTRY_COUNT) * 100),
    visitsPerYear: getVisitsPerYear(cities),
    longestTrip: getLongestTrip(cities),
  };
}
