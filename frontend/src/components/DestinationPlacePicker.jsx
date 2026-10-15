import { useId, useMemo, useState } from "react";
import Button from "./Button";
import Field from "./Field";
import FlagBox from "./FlagBox";
import LocationSearch from "./LocationSearch";
import styles from "./DestinationPlacePicker.module.css";

// Chooses where a destination is: one of the trip owner's Cities (linked
// by id, details copied) or a new place from the location search, which
// stays on the trip only and is never added to Cities. Used by the
// destination dialog and by the first destination when starting a trip.
//   cities:        the owner's cities ([] hides "From your cities")
//   place:         the chosen place, or null
//   onPlaceChange: (place | null, city | undefined) - city is the source
//                  City when one was picked from the list
//   legend:        fieldset legend
//   error:         validation message for the place
//   onClear:       when given, a "Remove" button clears the choice
function DestinationPlacePicker({ cities, place, onPlaceChange, legend = "Place", error, onClear }) {
  const idPrefix = useId();
  const id = (name) => `${idPrefix}-${name}`;

  const [source, setSource] = useState(
    place ? (place.cityId ? "cities" : "search") : cities.length ? "cities" : "search",
  );

  // Cities grouped by country, alphabetically, for <optgroup>s.
  const citiesByCountry = useMemo(() => {
    const groups = {};
    for (const city of cities) (groups[city.country] ??= []).push(city);
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([country, list]) => [
        country,
        [...list].sort((a, b) => a.cityName.localeCompare(b.cityName)),
      ]);
  }, [cities]);

  function handleCitySelect(cityId) {
    const city = cities.find((c) => c.id === cityId);
    if (!city) {
      onPlaceChange(null);
      return;
    }
    onPlaceChange(
      {
        cityId: city.id,
        cityName: city.cityName,
        country: city.country,
        countryCode: city.countryCode,
        region: city.region ?? "",
        position: city.position,
      },
      city,
    );
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{legend}</legend>

      {cities.length > 0 && (
        <div className={styles.sourceToggle} role="radiogroup" aria-label="Where to pick the place from">
          {[
            ["cities", "From your cities"],
            ["search", "New place"],
          ].map(([value, label]) => (
            <label key={value} className={styles.sourceOption}>
              <input
                type="radio"
                name={id("source")}
                value={value}
                checked={source === value}
                onChange={() => setSource(value)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {source === "cities" && cities.length > 0 ? (
        <Field id={id("city")} label="City" error={error}>
          <select
            id={id("city")}
            className={styles.select}
            value={place?.cityId ?? ""}
            onChange={(e) => handleCitySelect(e.target.value)}
          >
            <option value="">Choose one of your cities…</option>
            {citiesByCountry.map(([country, list]) => (
              <optgroup key={country} label={country}>
                {list.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.cityName}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      ) : (
        <div className={styles.search}>
          <LocationSearch onSelect={(location) => onPlaceChange({ ...location, cityId: null })} />
          <p className={styles.hint}>
            A new place is saved with this trip only - it isn&apos;t added to your Cities.
          </p>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {place && (
        <div className={styles.selected}>
          <p aria-live="polite">
            <FlagBox countryCode={place.countryCode} country={place.country} position="left" />
            <span>
              <strong>{place.cityName}</strong>
              {[place.region, place.country].filter(Boolean).length > 0 &&
                `, ${[place.region, place.country].filter(Boolean).join(", ")}`}
            </span>
          </p>
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              htmlType="button"
              onClick={onClear}
              aria-label={`Remove ${place.cityName}`}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </fieldset>
  );
}

export default DestinationPlacePicker;
