import { createContext, useContext } from "react";

// Which trip (if any) the map is showing, and requests passed between the
// itinerary in the sidebar and the map. Provided by TripMapProvider.jsx;
// kept apart from it so that file only exports a component
// (react-refresh/only-export-components).
//
// The default is "no trip" with no-op actions, so the map and the pages
// work unchanged without a provider (tests, public pages).
const noop = () => {};

export const NO_TRIP_MAP = {
  mapTrip: null,
  activeDestinationId: null,
  focusRequest: null,
  revealRequest: null,
  showTripOnMap: noop,
  clearTripMap: noop,
  focusDestination: noop,
  revealDestination: noop,
  selectDestination: noop,
};

export const TripMapContext = createContext(NO_TRIP_MAP);

export const useTripMap = () => useContext(TripMapContext);
