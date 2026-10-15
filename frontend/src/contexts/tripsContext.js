import { createContext, useContext } from "react";

// Kept apart from TripsProvider.jsx so that file only exports a component
// (react-refresh/only-export-components).
export const TripsContext = createContext();

export function useTrips() {
  const context = useContext(TripsContext);
  if (context === undefined)
    throw new Error("TripsContext was used outside TripsProvider");
  return context;
}
