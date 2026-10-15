import { useEffect, useState } from "react";
import { getProfileSummary } from "../services/profileService";

// For an admin or super admin looking at someone else's trip: the owner's
// { fullName, role }, used to show who owns it and to decide which controls
// to show (an admin can't manage a super admin's trip). owner is null for
// the viewer's own trips, for non-staff viewers, and when the profile is
// hidden or fails to load (so nothing is shown as manageable by mistake).
export function useTripOwner(trip, viewer) {
  const ownerId = trip?.userId;
  const isStaff = viewer.role === "admin" || viewer.role === "super_admin";
  const needsOwner = Boolean(ownerId) && isStaff && ownerId !== viewer.id;

  // The owner id the current result belongs to, so a stale result is never
  // used for a different trip.
  const [result, setResult] = useState({ forId: null, owner: null });

  useEffect(() => {
    if (!needsOwner) return;

    let isMounted = true;
    getProfileSummary(ownerId)
      .then((data) => {
        if (isMounted) {
          setResult({
            forId: ownerId,
            owner: data ? { fullName: data.full_name, role: data.role } : null,
          });
        }
      })
      .catch((err) => {
        console.error("Failed to load trip owner:", err.message);
        if (isMounted) setResult({ forId: ownerId, owner: null });
      });

    return () => {
      isMounted = false;
    };
  }, [ownerId, needsOwner]);

  const isCurrent = needsOwner && result.forId === ownerId;
  return {
    owner: isCurrent ? result.owner : null,
    isLoading: needsOwner && !isCurrent,
  };
}
