import { ContinentCodes } from "@brixtol/country-continent";

// Every ISO 3166-1 alpha-2 country the continent mapping knows, with its
// English name, sorted by name. Used when a city's country has to be picked
// by hand (reverse geocoding unavailable).
const names = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

export const COUNTRIES = Object.keys(ContinentCodes)
  .map((code) => ({ code, name: names.of(code) }))
  .filter((country) => country.name)
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function getCountryName(code) {
  return NAME_BY_CODE.get(String(code ?? "").toUpperCase()) ?? "";
}
