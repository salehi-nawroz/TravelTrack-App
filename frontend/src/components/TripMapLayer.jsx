import { useEffect, useMemo, useRef } from "react";
import { Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import FlagBox from "./FlagBox";
import mapStyles from "./Map.module.css";
import styles from "./TripMapLayer.module.css";
import { getTripMapData, placesKey } from "../utils/tripMap";
import { formatStay } from "../utils/tripDates";

// One place: centred at this zoom. Many: fitted, but not closer than this.
const SINGLE_STOP_ZOOM = 10;
const MAX_FIT_ZOOM = 11;
// A focused stop is shown at least this close.
const FOCUS_ZOOM = 9;

// Route: an amber dashed line on a dark casing, so it reads on both the light
// map tiles and the green city colours.
const ROUTE_CASING = { color: "#2d3439", weight: 7, opacity: 0.55, lineCap: "round", lineJoin: "round" };
const ROUTE_LINE = { color: "#ffb545", weight: 3.5, opacity: 1, dashArray: "8 7", lineCap: "round", lineJoin: "round" };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const isPhone = () =>
  typeof window !== "undefined" && window.matchMedia?.("(max-width: 767.98px)").matches;

// Room around the route for the map's own overlays: the search box at the
// top, and on phones the collapsed bottom sheet and nav bar at the bottom.
const fitPadding = () =>
  isPhone()
    ? { paddingTopLeft: [40, 96], paddingBottomRight: [40, 150] }
    : { paddingTopLeft: [56, 96], paddingBottomRight: [56, 72] };

// Numbered round markers (city pins are green teardrops, so the two never
// look alike). Cached per number/state so React-Leaflet doesn't re-create
// icons on every render.
const iconCache = new Map();
function stopIcon(number, isActive) {
  const key = `${number}-${isActive}`;
  if (!iconCache.has(key)) {
    const size = isActive ? 36 : 30;
    iconCache.set(
      key,
      L.divIcon({
        className: "",
        html: `<span class="${styles.stop} ${isActive ? styles.stopActive : ""}">${number}</span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      }),
    );
  }
  return iconCache.get(key);
}

function fitToPoints(map, points, animate = !prefersReducedMotion()) {
  if (!points.length) return;
  if (points.length === 1) {
    map.setView(points[0].latlng, SINGLE_STOP_ZOOM, { animate });
    return;
  }
  map.fitBounds(L.latLngBounds(points.map((p) => p.latlng)), {
    ...fitPadding(),
    maxZoom: MAX_FIT_ZOOM,
    animate,
  });
}

// A trip's itinerary on the map: numbered markers in itinerary order, the
// route between them, and popups. Fits the view to the trip when it opens
// and whenever its set of places changes, focuses stops on request, and
// puts the previous view back when the trip is closed.
//   shouldRestoreView: () => boolean, asked on close (false when the page
//                      being opened sets its own map position)
function TripMapLayer({
  trip,
  activeDestinationId,
  focusRequest,
  onSelectDestination,
  onShowInItinerary,
  shouldRestoreView,
}) {
  const map = useMap();
  const { points, segments, total } = useMemo(
    () => getTripMapData(trip.destinations),
    [trip.destinations],
  );
  const markers = useRef(new Map());

  const pointsRef = useRef(points);
  pointsRef.current = points;
  const restoreRef = useRef(shouldRestoreView);
  restoreRef.current = shouldRestoreView;

  // Back to the view from before the trip opened, unless the next page sets
  // its own.
  useEffect(() => {
    const saved = { center: map.getCenter(), zoom: map.getZoom() };
    return () => {
      if (!restoreRef.current || restoreRef.current()) {
        map.setView(saved.center, saved.zoom, { animate: false });
      }
    };
  }, [map]);

  // Fit when the trip opens and when places are added, moved or removed
  // (not on a reorder: same places, so the view stays where the user put it).
  const key = placesKey(trip.id, points);
  useEffect(() => {
    fitToPoints(map, pointsRef.current);
  }, [map, key]);

  // Leaflet gives these div markers role="button" and a tab stop, but only
  // an <img> icon gets an accessible name (alt), so label each marker
  // element. Done after every render because numbers change when stops are
  // reordered, and React-Leaflet only applies `title` when a marker is
  // created - so the tooltip is kept current here too.
  useEffect(() => {
    for (const { destination, number } of points) {
      const element = markers.current.get(destination.id)?.getElement?.();
      if (!element) continue;
      element.setAttribute("aria-label", `Stop ${number} of ${total}: ${destination.cityName}`);
      element.setAttribute("title", `Stop ${number}: ${destination.cityName}`);
    }
  });

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.destinationId == null) {
      fitToPoints(map, pointsRef.current);
      return;
    }
    const point = pointsRef.current.find((p) => p.destination.id === focusRequest.destinationId);
    if (!point) return;
    map.setView(point.latlng, Math.max(map.getZoom(), FOCUS_ZOOM), {
      animate: !prefersReducedMotion(),
    });
    markers.current.get(point.destination.id)?.openPopup();
  }, [map, focusRequest]);

  return (
    <>
      {segments.map((segment, i) => (
        <Polyline key={`casing-${i}`} positions={segment} pathOptions={ROUTE_CASING} interactive={false} />
      ))}
      {segments.map((segment, i) => (
        <Polyline key={`route-${i}`} positions={segment} pathOptions={ROUTE_LINE} interactive={false} />
      ))}

      {points.map(({ destination, number, latlng }) => {
        const isActive = destination.id === activeDestinationId;
        const stay = formatStay(destination);
        const place = [destination.region, destination.country].filter(Boolean).join(", ");
        return (
          <Marker
            key={destination.id}
            position={latlng}
            icon={stopIcon(number, isActive)}
            zIndexOffset={isActive ? 1000 : 500}
            title={`Stop ${number}: ${destination.cityName}`}
            ref={(marker) => {
              if (marker) markers.current.set(destination.id, marker);
              else markers.current.delete(destination.id);
            }}
            eventHandlers={{ click: () => onSelectDestination(destination.id) }}
          >
            <Popup className={`${mapStyles.popup} ${styles.popup}`}>
              <div className={mapStyles.popupHeader}>
                <FlagBox countryCode={destination.countryCode} country={destination.country} position="left" />
                <div className={mapStyles.popupTitle}>
                  <strong>{destination.cityName}</strong>
                  {place && <span>{place}</span>}
                </div>
              </div>
              <span className={styles.stopOf}>
                Stop {number} of {total} · {trip.title}
              </span>
              {stay && <span className={mapStyles.popupDate}>{stay}</span>}
              {destination.notes && <p className={mapStyles.popupNotes}>{destination.notes}</p>}
              <button
                type="button"
                className={styles.popupButton}
                onClick={() => onShowInItinerary(destination.id)}
              >
                Show in itinerary
              </button>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default TripMapLayer;
