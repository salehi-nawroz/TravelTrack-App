import { useState } from "react";

// Without a timeout some browsers (desktop Chrome/Windows especially) can
// leave the request pending forever. A recent cached fix is fine for
// centring the map.
const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000,
};

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

export function useGeolocation(defaultPosition = null) {
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(defaultPosition);
  const [error, setError] = useState(null);

  function getPosition() {
    if (!navigator.geolocation)
      return setError("Your browser does not support geolocation");

    // Browsers only allow geolocation on https:// pages (and localhost).
    if (!window.isSecureContext)
      return setError(
        "Your location can only be used when the app is opened over https.",
      );

    setError(null);
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setIsLoading(false);
      },
      (error) => {
        setError(getErrorMessage(error));
        setIsLoading(false);
      },
      GEOLOCATION_OPTIONS,
    );
  }

  const clearError = () => setError(null);

  return { isLoading, position, error, getPosition, clearError };
}
