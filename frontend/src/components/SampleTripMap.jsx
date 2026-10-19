import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import FlagBox from "./FlagBox";
import MapAutoResize from "./MapAutoResize";
import TripMapLayer from "./TripMapLayer";
import mapStyles from "./Map.module.css";
import styles from "./SampleTripMap.module.css";
import { formatTripDate, toIsoDate } from "../utils/tripDates";

// Read-only Leaflet map for the public pages (Home preview, Explore demo),
// fed with local sample data only. Shows either every sample place as the
// app's green city pins, or one trip's itinerary through the app's own
// TripMapLayer (numbered stops, route, popups).
//   interactive: false for a static preview (no dragging, zooming, popups)

// Same pin as the app's city map (see Map.jsx / Map.module.css .pin).
const CITY_PIN_SIZE = 26;
const CITY_PIN_TIP = Math.round(CITY_PIN_SIZE / 2 + (CITY_PIN_SIZE * Math.SQRT2) / 2);
const cityPin = L.divIcon({
  className: "",
  html: `<span class="${mapStyles.pin} ${mapStyles.cityPin}"></span>`,
  iconSize: [CITY_PIN_SIZE, CITY_PIN_SIZE],
  iconAnchor: [CITY_PIN_SIZE / 2, CITY_PIN_TIP],
  popupAnchor: [0, -CITY_PIN_TIP],
});

function FitCities({ cities }) {
  const map = useMap();
  useEffect(() => {
    if (!cities.length) return;
    map.fitBounds(L.latLngBounds(cities.map((c) => [c.position.lat, c.position.lng])), {
      padding: [32, 32],
      maxZoom: 6,
      animate: false,
    });
  }, [map, cities]);
  return null;
}

function SampleTripMap({
  trip,
  cities,
  interactive = true,
  activeDestinationId = null,
  focusRequest = null,
  onSelectDestination = () => {},
  onShowInItinerary = () => {},
  onSelectTrip,
  className = "",
  label = "Sample travel map",
}) {
  return (
    <div className={`${styles.wrapper} ${className}`} role="region" aria-label={label}>
      <MapContainer
        center={[30, 10]}
        zoom={2}
        minZoom={2}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        boxZoom={interactive}
        keyboard={interactive}
        className={`${mapStyles.map} ${styles.map}`}
      >
        {interactive && <ZoomControl position="bottomright" />}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapAutoResize />

        {trip ? (
          <TripMapLayer
            key={interactive ? "interactive" : "preview"}
            trip={trip}
            activeDestinationId={activeDestinationId}
            focusRequest={focusRequest}
            onSelectDestination={onSelectDestination}
            onShowInItinerary={onShowInItinerary}
            shouldRestoreView={() => false}
          />
        ) : (
          <>
            <FitCities cities={cities} />
            {cities.map((city) => (
              <Marker
                key={city.id}
                position={[city.position.lat, city.position.lng]}
                icon={cityPin}
                title={`${city.cityName}, ${city.country}`}
                interactive={interactive}
                keyboard={interactive}
              >
                {interactive && (
                  <Popup className={mapStyles.popup}>
                    <div className={mapStyles.popupHeader}>
                      <FlagBox countryCode={city.countryCode} country={city.country} position="left" />
                      <div className={mapStyles.popupTitle}>
                        <strong>{city.cityName}</strong>
                        <span>{city.country}</span>
                      </div>
                    </div>
                    <span className={mapStyles.popupDate}>Visited {formatTripDate(toIsoDate(city.date))}</span>
                    {city.notes && <p className={mapStyles.popupNotes}>{city.notes}</p>}
                    {onSelectTrip && (
                      <button
                        type="button"
                        className={styles.popupButton}
                        onClick={() => onSelectTrip(city.tripId)}
                      >
                        Show the {city.tripTitle} trip
                      </button>
                    )}
                  </Popup>
                )}
              </Marker>
            ))}
          </>
        )}
      </MapContainer>
    </div>
  );
}

export default SampleTripMap;
