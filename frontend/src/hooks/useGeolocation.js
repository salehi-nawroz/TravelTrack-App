import { useEffect, useRef, useState } from "react";

// Without a timeout some browsers (desktop Chrome/Windows especially) can
// leave the request pending forever. A recent cached fix is fine for
// centring the map.
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000,
};

const INVALID_POSITION_MESSAGE =
  "Your location could not be read. Please try again.";

// GeolocationPositionError codes -> messages a user can act on. The
// browser's own error.message is technical and differs per browser.
function getErrorMessage(error) {
  switch (error.code) {
    case 1: // PERMISSION_DENIED
      return "Location access was blocked. Allow location for this site in your browser settings and try again.";
    case 2: // POSITION_UNAVAILABLE
      return "Your location isn't available right now. Check that location services are turned on for your device.";
    case 3: // TIMEOUT
      return "Finding your location took too long. Please try again.";
    default:
      return "Your location could not be found. Please try again.";
  }
}

const isValidCoordinate = (lat, lng) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

// The browser's current position, read only when asked (getPosition) and
// kept in the browser - nothing here sends it anywhere.
//
// Each request gets an id; a reply only counts if it is still the latest
// request when it arrives. clearPosition() and unmounting move the id on,
// so a late reply can never move the map or set state afterwards. While a
// request is pending, further getPosition() calls are ignored.
export function useGeolocation(defaultPosition = null) {
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(defaultPosition);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const isPendingRef = useRef(false);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
      isPendingRef.current = false;
    },
    [],
  );

  function getPosition() {
    if (isPendingRef.current) return;

    if (!navigator.geolocation)
      return setError("Your browser does not support geolocation");

    // Browsers only allow geolocation on https:// pages (and localhost).
    if (!window.isSecureContext)
      return setError(
        "Your location can only be used when the app is opened over https.",
      );

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    isPendingRef.current = true;
    setError(null);
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isCurrent()) return;
        isPendingRef.current = false;

        const { latitude, longitude, accuracy } = pos.coords;
        if (!isValidCoordinate(latitude, longitude)) {
          setError(INVALID_POSITION_MESSAGE);
        } else {
          setPosition({
            lat: latitude,
            lng: longitude,
            accuracy: Number.isFinite(accuracy) ? accuracy : 0,
          });
        }
        setIsLoading(false);
      },
      (error) => {
        if (!isCurrent()) return;
        isPendingRef.current = false;
        setError(getErrorMessage(error));
        setIsLoading(false);
      },
      GEOLOCATION_OPTIONS,
    );
  }

  // Forgets the position and cancels any request still in flight.
  function clearPosition() {
    requestIdRef.current += 1;
    isPendingRef.current = false;
    setIsLoading(false);
    setPosition(null);
  }

  const clearError = () => setError(null);

  return { isLoading, position, error, getPosition, clearPosition, clearError };
}
