import { useEffect } from "react";

// Browser tab / history title for the current page: "Cities · TravelTrack".
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title =
      title && title !== "TravelTrack" ? `${title} · TravelTrack` : "TravelTrack";
  }, [title]);
}
