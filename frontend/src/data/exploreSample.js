// Sample data for the public pages (Home previews and the Explore demo).
// A fictional traveller: no real account, no Supabase, nothing is saved.
// Shapes match the app's own domain objects (see services/tripService.js
// and services/cityService.js), so the same components and helpers work
// on them unchanged.

import { getContinent } from "../utils/continent";
import { getTravelStats } from "../utils/travelStats";
import { tripLengthDays } from "../utils/tripDates";

const stop = (id, cityName, country, countryCode, lat, lng, arrivalDate, departureDate, notes = "", region = "") => ({
  id,
  cityName,
  country,
  countryCode,
  region,
  position: { lat, lng },
  arrivalDate,
  departureDate,
  notes,
});

const trip = (id, title, description, startDate, endDate, stops) => ({
  id,
  title,
  description,
  startDate,
  endDate,
  status: endDate ? "completed" : "active",
  destinations: stops.map((s, i) => ({ ...s, tripId: id, sortOrder: i })),
  photos: [],
});

export const SAMPLE_TRAVELLER = "Alex (sample traveller)";

// Newest first, like the app's Trips page.
export const SAMPLE_TRIPS = [
  trip(
    "iberia",
    "Iberian rail loop",
    "Lisbon to Madrid by train, slowly, with plenty of pastéis de nata on the way.",
    "2025-05-01",
    "2025-05-12",
    [
      stop("iberia-1", "Lisbon", "Portugal", "PT", 38.7223, -9.1393, "2025-05-01", "2025-05-04", "Tram 28 at sunrise, then pastéis de nata in Belém."),
      stop("iberia-2", "Porto", "Portugal", "PT", 41.1579, -8.6291, "2025-05-04", "2025-05-07", "Port lodges across the Douro and the view from Dom Luís I."),
      stop("iberia-3", "Salamanca", "Spain", "ES", 40.9701, -5.6635, "2025-05-07", "2025-05-09", "Plaza Mayor glowing gold at night.", "Castile and León"),
      stop("iberia-4", "Madrid", "Spain", "ES", 40.4168, -3.7038, "2025-05-09", "2025-05-12", "The Prado in the morning, Retiro by bike in the afternoon."),
    ],
  ),
  trip(
    "japan",
    "Autumn in Japan",
    "Two weeks of temples, trains and momiji season.",
    "2024-10-01",
    "2024-10-14",
    [
      stop("japan-1", "Tokyo", "Japan", "JP", 35.6762, 139.6503, "2024-10-01", "2024-10-05", "Shibuya crossing at dusk; early morning at Tsukiji outer market."),
      stop("japan-2", "Hakone", "Japan", "JP", 35.2324, 139.1069, "2024-10-05", "2024-10-07", "Mount Fuji finally showed itself from Lake Ashi.", "Kanagawa"),
      stop("japan-3", "Kyoto", "Japan", "JP", 35.0116, 135.7681, "2024-10-07", "2024-10-11", "Fushimi Inari before 7am - nearly empty."),
      stop("japan-4", "Osaka", "Japan", "JP", 34.6937, 135.5023, "2024-10-11", "2024-10-14", "Street food in Dotonbori."),
    ],
  ),
  trip(
    "istanbul",
    "Weekend in Istanbul",
    "A long weekend between two continents.",
    "2024-03-15",
    "2024-03-18",
    [
      stop("istanbul-1", "Istanbul", "Türkiye", "TR", 41.0082, 28.9784, "2024-03-15", "2024-03-18", "Ferry across the Bosphorus at sunset."),
    ],
  ),
  trip(
    "balkans",
    "Balkan road trip",
    "Down the Adriatic coast from the Alps to the Bay of Kotor.",
    "2023-06-02",
    "2023-06-14",
    [
      stop("balkans-1", "Ljubljana", "Slovenia", "SI", 46.0569, 14.5058, "2023-06-02", "2023-06-04", "Dragon Bridge and the river cafés."),
      stop("balkans-2", "Zagreb", "Croatia", "HR", 45.815, 15.9819, "2023-06-04", "2023-06-05"),
      stop("balkans-3", "Plitvice Lakes", "Croatia", "HR", 44.8654, 15.582, "2023-06-05", "2023-06-07", "Sixteen terraced lakes - worth the early start.", "Lika-Senj"),
      stop("balkans-4", "Split", "Croatia", "HR", 43.5081, 16.4402, "2023-06-07", "2023-06-10"),
      stop("balkans-5", "Dubrovnik", "Croatia", "HR", 42.6507, 18.0944, "2023-06-10", "2023-06-12", "Walked the full city walls."),
      stop("balkans-6", "Kotor", "Montenegro", "ME", 42.4247, 18.7712, "2023-06-12", "2023-06-14", "1,350 steps up to San Giovanni fortress."),
    ],
  ),
  trip(
    "patagonia",
    "Patagonia trek",
    "Glaciers, granite towers and the wind that never stops.",
    "2022-11-20",
    "2022-12-05",
    [
      stop("patagonia-1", "Buenos Aires", "Argentina", "AR", -34.6037, -58.3816, "2022-11-20", "2022-11-23", "Tango in San Telmo."),
      stop("patagonia-2", "El Calafate", "Argentina", "AR", -50.3379, -72.2648, "2022-11-23", "2022-11-26", "Perito Moreno glacier calving.", "Santa Cruz"),
      stop("patagonia-3", "El Chaltén", "Argentina", "AR", -49.3315, -72.8863, "2022-11-26", "2022-11-30", "Laguna de los Tres at sunrise.", "Santa Cruz"),
      stop("patagonia-4", "Puerto Natales", "Chile", "CL", -51.7236, -72.4875, "2022-11-30", "2022-12-03", "Base for the Torres del Paine W trek.", "Magallanes"),
      stop("patagonia-5", "Punta Arenas", "Chile", "CL", -53.1638, -70.9171, "2022-12-03", "2022-12-05", "", "Magallanes"),
    ],
  ),
];

// Every stop as a city visit (the app's city shape), for the city list and
// the statistics helpers.
export const SAMPLE_CITIES = SAMPLE_TRIPS.flatMap((t) =>
  t.destinations.map((d) => {
    const [year, month, day] = d.arrivalDate.split("-").map(Number);
    return {
      id: d.id,
      cityName: d.cityName,
      country: d.country,
      countryCode: d.countryCode,
      region: d.region,
      notes: d.notes,
      date: new Date(year, month - 1, day),
      position: d.position,
      tripId: t.id,
      tripTitle: t.title,
    };
  }),
);

export function getSampleStats() {
  const stats = getTravelStats(SAMPLE_CITIES);
  return {
    ...stats,
    tripCount: SAMPLE_TRIPS.length,
    daysTravelling: SAMPLE_TRIPS.reduce((sum, t) => sum + tripLengthDays(t.startDate, t.endDate), 0),
    continents: new Set(SAMPLE_CITIES.map((c) => getContinent(c.countryCode))).size,
  };
}
