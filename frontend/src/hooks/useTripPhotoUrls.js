import { useEffect, useState } from "react";
import { getPhotoUrls } from "../services/tripPhotoService";

// Signed URLs ({ [storagePath]: url }) for a set of trip photo paths, in
// one request, re-requested only when the set of paths changes. A path the
// viewer can't read is just missing from the result.
export function useTripPhotoUrls(paths) {
  const key = [...new Set(paths)].sort().join("|");
  const [urls, setUrls] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    if (!key) {
      setUrls({});
      return;
    }

    let isMounted = true;
    setError("");

    getPhotoUrls(key.split("|"))
      .then((data) => {
        if (isMounted) setUrls(data);
      })
      .catch((err) => {
        console.error("Failed to load trip photos:", err.message);
        if (isMounted) setError("Photos couldn't be loaded. Try reloading the page.");
      });

    return () => {
      isMounted = false;
    };
  }, [key]);

  return { urls, error };
}
