import { useEffect, useState } from "react";
import { GeoJSON, MapContainer } from "react-leaflet";

import styles from "./StatsMap.module.css";
import Spinner from "./Spinner";
import MapAutoResize from "./MapAutoResize";

// Natural Earth 1:110m admin-0 countries (public domain), trimmed to an ISO
// alpha-2 code and a name per country. Served from public/ and fetched only
// when this map is shown, so it stays out of the JS bundle.
const COUNTRIES_URL = `${import.meta.env.BASE_URL}data/countries-110m.geojson`;

// Fetched once per page load and shared by every later visit to the page.
let countriesPromise = null;

function loadCountries() {
  countriesPromise ??= fetch(COUNTRIES_URL).then((res) => {
    if (!res.ok) throw new Error(`Map data request failed (${res.status})`);
    return res.json();
  });

  countriesPromise.catch(() => {
    countriesPromise = null; // allow a retry on the next visit
  });

  return countriesPromise;
}

// Leaflet path styles need literal colours. These mirror the design tokens
// in index.css: --color-brand-dark (visited), --color-surface-3 (not
// visited), --color-surface-1 (borders), --color-text-primary (hover).
const VISITED_STYLE = {
  fillColor: "#00b060",
  fillOpacity: 1,
  color: "#2d3439",
  weight: 1,
};

const NOT_VISITED_STYLE = {
  fillColor: "#5a6166",
  fillOpacity: 1,
  color: "#2d3439",
  weight: 1,
};

// Choropleth of the signed-in user's visited countries. Only the set of ISO
// codes is passed in - no city data reaches the map.
function StatsMap({ countryCodes, cityCountByCode }) {
  const [countries, setCountries] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    loadCountries()
      .then((data) => !ignore && setCountries(data))
      .catch(() => !ignore && setError("The world map could not be loaded."));

    return () => {
      ignore = true;
    };
  }, []);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!countries) return <Spinner />;

  // Visited countries that the 1:110m dataset is too coarse to draw (e.g.
  // Singapore, Malta): listed under the map so they aren't silently missing.
  const mappedCodes = new Set(countries.features.map((f) => f.properties.iso));
  const unmapped = [...countryCodes].filter((code) => !mappedCodes.has(code));

  function styleCountry(feature) {
    return countryCodes.has(feature.properties.iso)
      ? VISITED_STYLE
      : NOT_VISITED_STYLE;
  }

  function onEachCountry(feature, layer) {
    const { iso, name } = feature.properties;
    const count = cityCountByCode[iso] ?? 0;
    const detail = count
      ? `${count} ${count === 1 ? "city" : "cities"}`
      : "Not visited yet";

    layer.bindTooltip(`<strong>${name}</strong><br />${detail}`, {
      sticky: true,
    });
    layer.on({
      mouseover: () => layer.setStyle({ weight: 2, color: "#ececec" }),
      mouseout: () => layer.setStyle({ weight: 1, color: "#2d3439" }),
    });
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.mapContainer}>
        <MapContainer
          center={[20, 10]}
          zoom={1}
          minZoom={1}
          maxZoom={5}
          zoomSnap={0.5}
          scrollWheelZoom={false}
          attributionControl={false}
          maxBounds={[
            [-90, -200],
            [90, 200],
          ]}
          className={styles.map}
        >
          <GeoJSON
            // GeoJSON layers don't restyle when props change; a new key
            // rebuilds the layer when the visited set does.
            key={[...countryCodes].sort().join(",")}
            data={countries}
            style={styleCountry}
            onEachFeature={onEachCountry}
          />
          <MapAutoResize />
        </MapContainer>
      </div>

      <ul className={styles.legend}>
        <li>
          <span className={`${styles.swatch} ${styles.visited}`} /> Visited
        </li>
        <li>
          <span className={`${styles.swatch} ${styles.notVisited}`} /> Not
          visited
        </li>
      </ul>

      {unmapped.length > 0 && (
        <p className={styles.note}>
          Too small to show at this scale: {unmapped.join(", ")}
        </p>
      )}

      <p className={styles.source}>
        Country borders:{" "}
        <a
          href="https://www.naturalearthdata.com/"
          target="_blank"
          rel="noreferrer"
        >
          Natural Earth
        </a>
      </p>
    </div>
  );
}

export default StatsMap;
