import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { TripsContext } from "./tripsContext";
import { getMyTrips, createTrip as createTripApi } from "../services/tripService";
import { compareIsoDates } from "../utils/tripDates";
import { TRIPS_ENABLED } from "../config/features";

const byStartDateDesc = (a, b) => compareIsoDates(b.startDate, a.startDate);

// The signed-in user's own trips, for the Trips list and the "one active
// trip" check. Pages that change a trip (detail, edit, photos) save through
// tripService and then hand the updated trip back with upsertTrip, so the
// list never needs a full reload. Does nothing while TRIPS_ENABLED is off.
function TripsProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(TRIPS_ENABLED);
  const [error, setError] = useState("");
  // Bumped by reload() ("Try again") to repeat the read-only load.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!TRIPS_ENABLED || !userId) {
      setTrips([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError("");

    getMyTrips()
      .then((data) => {
        if (isMounted) setTrips(data);
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  // Only the user's own trips belong in this list (an admin editing someone
  // else's trip goes through the same pages).
  const upsertTrip = useCallback(
    (trip) => {
      if (trip.userId !== userId) return;
      setTrips((current) =>
        [...current.filter((t) => t.id !== trip.id), trip].sort(byStartDateDesc),
      );
    },
    [userId],
  );

  const removeTrip = useCallback((id) => {
    setTrips((current) => current.filter((trip) => trip.id !== id));
  }, []);

  const createTrip = useCallback(
    async (fields) => {
      const trip = await createTripApi(fields);
      upsertTrip(trip);
      return trip;
    },
    [upsertTrip],
  );

  const value = useMemo(
    () => ({
      trips,
      isLoading,
      error,
      activeTrip: trips.find((trip) => trip.status === "active") ?? null,
      reload,
      upsertTrip,
      removeTrip,
      createTrip,
    }),
    [trips, isLoading, error, reload, upsertTrip, removeTrip, createTrip],
  );

  return <TripsContext.Provider value={value}>{children}</TripsContext.Provider>;
}

export default TripsProvider;
