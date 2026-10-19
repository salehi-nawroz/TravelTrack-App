import { useCallback, useMemo, useRef, useState } from "react";
import { TripMapContext } from "./tripMapContext";

// Shares the trip that's open in the sidebar with the map next to it.
//   mapTrip:             { id, title, destinations } or null (normal map)
//   activeDestinationId: the stop last selected on either side
//   focusRequest:        { destinationId | null, n } - "show this stop (or,
//                        for null, the whole route) on the map"
//   revealRequest:       { destinationId, n } - "show this stop in the
//                        itinerary"
// Requests carry a counter so asking for the same stop twice still acts.
// Selections and requests remember the trip they were made for and are
// only exposed while that trip is on the map, so switching trips never
// carries a selection over (no reset step that could race with a request).
function TripMapProvider({ children }) {
  const [mapTrip, setMapTrip] = useState(null);
  const [selection, setSelection] = useState({
    tripId: null,
    activeDestinationId: null,
    focusRequest: null,
    revealRequest: null,
  });
  const counter = useRef(0);
  const mapTripIdRef = useRef(null);
  mapTripIdRef.current = mapTrip?.id ?? null;

  const showTripOnMap = useCallback((trip) => {
    setMapTrip((current) =>
      current &&
      current.id === trip.id &&
      current.title === trip.title &&
      current.destinations === trip.destinations
        ? current
        : { id: trip.id, title: trip.title, destinations: trip.destinations },
    );
  }, []);

  // Only clears the trip it was asked to: a page that's being left can't
  // clear a trip another page has just shown.
  const clearTripMap = useCallback((tripId) => {
    setMapTrip((current) => (current?.id === tripId ? null : current));
  }, []);

  // Updates the selection for the trip currently on the map, starting from
  // a clean slate if the stored one belongs to another trip.
  const select = useCallback((changes) => {
    setSelection((current) => {
      const tripId = mapTripIdRef.current;
      const base =
        current.tripId === tripId
          ? current
          : {
              tripId,
              activeDestinationId: null,
              focusRequest: null,
              revealRequest: null,
            };
      return { ...base, ...changes };
    });
  }, []);

  const focusDestination = useCallback(
    (destinationId) =>
      select({
        activeDestinationId: destinationId ?? null,
        focusRequest: {
          destinationId: destinationId ?? null,
          n: ++counter.current,
        },
      }),
    [select],
  );

  const revealDestination = useCallback(
    (destinationId) =>
      select({
        activeDestinationId: destinationId,
        revealRequest: { destinationId, n: ++counter.current },
      }),
    [select],
  );

  const selectDestination = useCallback(
    (destinationId) => select({ activeDestinationId: destinationId }),
    [select],
  );

  const current = selection.tripId !== null && selection.tripId === mapTrip?.id;

  const value = useMemo(
    () => ({
      mapTrip,
      activeDestinationId: current ? selection.activeDestinationId : null,
      focusRequest: current ? selection.focusRequest : null,
      revealRequest: current ? selection.revealRequest : null,
      showTripOnMap,
      clearTripMap,
      focusDestination,
      revealDestination,
      selectDestination,
    }),
    [
      mapTrip,
      current,
      selection,
      showTripOnMap,
      clearTripMap,
      focusDestination,
      revealDestination,
      selectDestination,
    ],
  );

  return (
    <TripMapContext.Provider value={value}>{children}</TripMapContext.Provider>
  );
}

export default TripMapProvider;
