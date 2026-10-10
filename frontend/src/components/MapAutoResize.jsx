import { useEffect } from "react";
import { useMap } from "react-leaflet";

// Leaflet only re-measures itself on window resize. When its container
// changes size for any other reason (the sidebar being dragged wider or
// narrower), it keeps the old size and shows gray, untiled areas. Watching
// the container and calling invalidateSize() - once per frame at most -
// keeps it in step.
function MapAutoResize() {
  const map = useMap();

  useEffect(() => {
    let frame = 0;

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize());
    });
    observer.observe(map.getContainer());

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
}

export default MapAutoResize;
