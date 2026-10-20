import { geocodingApi, locationSearchApi } from "./api";

function createLocation({ cityName, region, country, countryCode, lat, lng }) {
  if (
    !cityName ||
    !country ||
    !countryCode ||
    !Number.isFinite(Number(lat)) ||
    !Number.isFinite(Number(lng))
  )
    return null;
  return {
    cityName,
    region: region || "",
    country,
    countryCode: countryCode.toUpperCase(),
    position: { lat, lng },
  };
}

function getSearchCityName(result) {
  const address = result.address || {};

  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    result.name ||
    result.display_name?.split(",")[0]
  );
}

export function normalizeSearchLocation(result) {
  const address = result.address || {};
  return createLocation({
    cityName: getSearchCityName(result),
    region:
      address.state ||
      address.region ||
      address.province ||
      address.state_district ||
      "",
    country: address.country,
    countryCode: address.country_code,
    lat: Number(result.lat),
    lng: Number(result.lon),
  });
}

// Reverse geocoding (BigDataCloud reverse-geocode-client). Resolves to a
// location, or null when the point isn't in a country (e.g. open sea).
// Rejects when the provider can't be reached; callers fall back to manual
// entry.
export async function getCityData(lat, lng) {
  const response = await geocodingApi.get("/reverse-geocode-client", {
    params: {
      latitude: lat,
      longitude: lng,
      localityLanguage: "en",
    },
  });

  const data = response.data ?? {};

  return createLocation({
    cityName: data.city || data.locality,
    region: data.principalSubdivision || "",
    country: data.countryName,
    countryCode: data.countryCode,
    lat: Number(lat),
    lng: Number(lng),
  });
}

export async function searchLocations(query) {
  const response = await locationSearchApi.get("/search", {
    params: {
      q: query.trim(),
      format: "jsonv2",
      addressdetails: 1,
      limit: 8,
      "accept-language": "en",
    },
  });
  const locations = response.data.map(normalizeSearchLocation).filter(Boolean);
  const uniqueLocations = Array.from(
    new Map(
      locations.map((location) => [
        [
          location.cityName.trim().toLowerCase(),
          location.region.trim().toLowerCase(),
          location.countryCode,
        ].join("-"),
        location,
      ]),
    ).values(),
  );
  return uniqueLocations;
}
