import styles from "./Map.module.css";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import L from "leaflet";
import { useCities } from "../contexts/CitiesContext";
import { useTripMap } from "../contexts/tripMapContext";
import TripMapLayer from "./TripMapLayer";
import tripStyles from "./TripMapLayer.module.css";
import { getTripMapData } from "../utils/tripMap";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useGeolocation } from "../hooks/useGeolocation";
import Button from "./Button";
import { useUrlPosition } from "../hooks/useUrlPosition";
import FlagBox from "./FlagBox";
import LocationSearch from "./LocationSearch";
import MapAutoResize from "./MapAutoResize";

// Pins drawn in CSS (see .pin in Map.module.css): green for saved cities,
// amber and slightly larger for the location currently being picked. The
// pin is a square rotated 45°, so its tip sits half a diagonal below the
// centre: iconAnchor puts that tip on the coordinate, and popups open just
// above the pin.
function createPin(variant, size) {
  const tip = Math.round(size / 2 + (size * Math.SQRT2) / 2);

  return L.divIcon({
    className: "",
    html: `<span class="${styles.pin} ${styles[variant]}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, tip],
    popupAnchor: [0, -tip],
  });
}

const cityPin = createPin("cityPin", 26);
const selectedPin = createPin("selectedPin", 30);

// "You are here": a blue dot (the familiar current-location style), kept
// apart from the green/amber place pins. Centred on the coordinate.
const userLocationIcon = L.divIcon({
  className: "",
  html: `<span class="${styles.userDot}"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
});

// The map's default view: where it opens, and where "Back to Default View"
// returns to.
const DEFAULT_CENTER = [40, 0];
const DEFAULT_ZOOM = 6;

// Close enough to see the user's neighbourhood and streets.
const USER_LOCATION_ZOOM = 12;

// The "Use Your Position" toggle's label per state: "default" (map as it
// opens), "locating" (request in flight), "user-location" (map centred on
// the user).
const POSITION_BUTTON_LABELS = {
  default: "Use Your Position",
  locating: "Locating…",
  "user-location": "Back to Default View",
};

const formatVisitDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));

function Map() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cities } = useCities();
  const [mapPosition, setMapPosition] = useState(DEFAULT_CENTER);
  const {
    isLoading: isLoadingPosition,
    position: geolocationPosition,
    error: geolocationError,
    getPosition,
    clearPosition,
    clearError: clearGeolocationError,
  } = useGeolocation();
  // Derived from the geolocation hook rather than stored separately, so the
  // label can't drift from what the map shows: a fix only exists once the
  // request succeeded with valid coordinates (and UserLocation has moved
  // the map to it).
  const positionMode = isLoadingPosition
    ? "locating"
    : geolocationPosition
      ? "user-location"
      : "default";
  // Bumped by "Back to Default View"; DefaultView applies it.
  const [defaultViewRequest, setDefaultViewRequest] = useState(0);

  function handlePositionToggle() {
    if (positionMode === "user-location") {
      clearPosition();
      clearGeolocationError();
      setDefaultViewRequest((count) => count + 1);
    } else {
      getPosition();
    }
  }
  const [searchParams] = useSearchParams();
  const isSelectingLocation = searchParams.get("selectLocation") === "true";
  const { lat: mapLat, lng: mapLng } = useUrlPosition();

  // An open trip (see TripDetail) replaces the city pins with its itinerary
  // until the trip page is left.
  const {
    mapTrip,
    activeDestinationId,
    focusRequest,
    selectDestination,
    revealDestination,
  } = useTripMap();
  const tripOnMap = mapTrip ?? null;
  const tripMapSummary = tripOnMap ? getTripMapData(tripOnMap.destinations) : null;
  // Read when the trip closes: a page that sets its own position (a city,
  // the add-city form) keeps it instead of getting the pre-trip view back.
  const hasUrlPositionRef = useRef(false);
  hasUrlPositionRef.current = Boolean(mapLat && mapLng);

  function handleSearchSelect(selectedLocation) {
    const path = isSelectingLocation ? location.pathname : "/app/form";
    const selectionMode = isSelectingLocation ? "selectLocation=true&" : "";

    navigate(
      `${path}?${selectionMode}locationSource=mapSearch&lat=${selectedLocation.position.lat}&lng=${selectedLocation.position.lng}`,
    );
  }
  // location.key changes on every navigation, even to an identical URL, so
  // a repeat click on a country/city whose coordinates coincide with
  // whatever is already applied still re-triggers the map update instead
  // of silently no-op'ing because mapLat/mapLng didn't change value.
  useEffect(() => {
    if (mapLat && mapLng) setMapPosition([mapLat, mapLng]);
  }, [mapLat, mapLng, location.key]);

  return (
    <div className={styles.mapContainer}>
      <LocationSearch
        onSelect={handleSearchSelect}
        variant="map"
        placeholder="Search city or country you visited"
      />

      {tripMapSummary && (
        <p className={tripStyles.chip} role="status">
          <span className={tripStyles.chipDot} aria-hidden="true" />
          <span className={tripStyles.chipText}>
            Trip: <strong>{tripOnMap.title}</strong> ·{" "}
            {tripMapSummary.points.length === tripMapSummary.total
              ? `${tripMapSummary.total} ${tripMapSummary.total === 1 ? "stop" : "stops"}`
              : `${tripMapSummary.points.length} of ${tripMapSummary.total} stops on the map`}
          </span>
        </p>
      )}

      {geolocationError && (
        <div className={styles.geoError} role="alert">
          <p>{geolocationError}</p>
          <button
            type="button"
            onClick={clearGeolocationError}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* Toggle: go to the user's position, then back to the default view.
          Disabled while locating, so only one request runs at a time. */}
      <Button
        type="position"
        htmlType="button"
        onClick={handlePositionToggle}
        disabled={positionMode === "locating"}
      >
        {POSITION_BUTTON_LABELS[positionMode]}
      </Button>

      <MapContainer
        center={mapPosition}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={true}
        zoomControl={false}
        className={`${styles.map} ${isSelectingLocation ? styles.selecting : ""}`}
      >
        <ZoomControl position="bottomright" />
        {/* Standard OpenStreetMap tiles, unfiltered (tile usage policy:
            attribution required, light use, no bulk downloading). */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {tripOnMap && (
          <TripMapLayer
            trip={tripOnMap}
            activeDestinationId={activeDestinationId}
            focusRequest={focusRequest}
            onSelectDestination={selectDestination}
            onShowInItinerary={revealDestination}
            shouldRestoreView={() => !hasUrlPositionRef.current}
          />
        )}

        {!tripOnMap && cities.map((city) => (
          <Marker
            position={[city.position.lat, city.position.lng]}
            key={city.id}
            icon={cityPin}
          >
            <Popup className={styles.popup}>
              <div className={styles.popupHeader}>
                <FlagBox
                  countryCode={city.countryCode}
                  country={city.country}
                  position="left"
                />
                <div className={styles.popupTitle}>
                  <strong>{city.cityName}</strong>
                  <span>{city.country}</span>
                </div>
              </div>
              <time className={styles.popupDate}>
                Visited {formatVisitDate(city.date)}
              </time>
              {city.notes && <p className={styles.popupNotes}>{city.notes}</p>}
              <Link
                className={styles.popupLink}
                to={`/app/cities/${city.id}?lat=${city.position.lat}&lng=${city.position.lng}`}
              >
                View details →
              </Link>
            </Popup>
          </Marker>
        ))}
        {mapLat && mapLng && (
          <Marker position={[mapLat, mapLng]} icon={selectedPin}>
            <Popup className={styles.popup}>
              <strong className={styles.popupSelected}>Selected location</strong>
            </Popup>
          </Marker>
        )}
        <UserLocation position={geolocationPosition} />
        <DefaultView request={defaultViewRequest} />
        <ChangeCenter position={mapPosition} />
        <MapAutoResize />
        <DetectClick isSelectingLocation={isSelectingLocation} />
      </MapContainer>
    </div>
  );
}

function ChangeCenter({ position }) {
  const map = useMap();

  // animate: false forces this to apply immediately and synchronously.
  // Leaflet's default animated pan transition can be interrupted or fail
  // to fully complete depending on timing, which caused the map to
  // sometimes land in the wrong place.
  useLayoutEffect(() => {
    map.setView(position, undefined, { animate: false });
  }, [map, position]);

  return null;
}

// "Back to Default View": returns to the map's default centre and zoom each
// time `request` changes (0 = never asked, so nothing happens on load). Only
// the view moves - markers, the selected city and filters are untouched.
function DefaultView({ request }) {
  const map = useMap();

  // Same reasoning as ChangeCenter for animate: false.
  useLayoutEffect(() => {
    if (!request) return;
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: false });
  }, [map, request]);

  return null;
}

// Centres and zooms in on each new geolocation fix, and marks the spot with
// the blue dot plus a circle for the reported accuracy. Panning or zooming
// afterwards is left alone until the toggle is pressed again.
function UserLocation({ position }) {
  const map = useMap();

  // Same reasoning as ChangeCenter for animate: false.
  useLayoutEffect(() => {
    if (!position) return;
    map.setView([position.lat, position.lng], USER_LOCATION_ZOOM, {
      animate: false,
    });
  }, [map, position]);

  if (!position) return null;

  const center = [position.lat, position.lng];

  return (
    <>
      {position.accuracy > 0 && (
        <Circle
          center={center}
          radius={position.accuracy}
          interactive={false}
          pathOptions={{
            color: "#1a73e8",
            weight: 1,
            opacity: 0.5,
            fillColor: "#1a73e8",
            fillOpacity: 0.12,
          }}
        />
      )}
      <Marker
        position={center}
        icon={userLocationIcon}
        zIndexOffset={1000}
        keyboard={false}
      >
        <Popup className={styles.popup}>
          <strong className={styles.popupSelected}>You are here</strong>
        </Popup>
      </Marker>
    </>
  );
}

function DetectClick({ isSelectingLocation }) {
  const navigate = useNavigate();
  const location = useLocation();
  useMapEvents({
    click: (e) => {
      const coordinates = `lat=${e.latlng.lat}&lng=${e.latlng.lng}`;

      navigate(
        isSelectingLocation
          ? `${location.pathname}?selectLocation=true&${coordinates}`
          : `form?${coordinates}`,
      );
    },
  });
}

export default Map;
