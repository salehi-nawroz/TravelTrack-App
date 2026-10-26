import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Button from "./Button";
import Card from "./Card";
import ConfirmDialog from "./ConfirmDialog";
import Dialog from "./Dialog";
import EmptyState from "./EmptyState";
import Field, { FormMessage } from "./Field";
import Spinner from "./Spinner";
import TripGallery from "./TripGallery";
import TripItinerary from "./TripItinerary";
import TripStatusBadge from "./TripStatusBadge";
import { buttonClassName } from "./buttonClassName";
import { useAuth } from "../contexts/AuthContext";
import { useCities } from "../contexts/CitiesContext";
import { useTrips } from "../contexts/tripsContext";
import { useTripMap } from "../contexts/tripMapContext";
import { useTripOwner } from "../hooks/useTripOwner";
import { deleteTrip, endTrip, getTrip } from "../services/tripService";
import { formatTripRange, todayIso, tripLengthDays } from "../utils/tripDates";
import { hasErrors, latestDeparture, validateTrip } from "../utils/tripValidation";
import { canDeleteTrip, canManageTrip, canUploadTripPhotos } from "../utils/tripPermissions";
import styles from "./TripDetail.module.css";

const plural = (count, word, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

const ROLE_LABELS = { user: "User", admin: "Admin", super_admin: "Super Admin" };

// /app/trips/:id - one trip: details, itinerary and photos, with End trip,
// Edit and Delete for whoever may manage it. Admins open other people's
// trips here from the Admin dashboard (location.state.from) and return
// there afterwards.
function TripDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { cities } = useCities();
  const { upsertTrip, removeTrip } = useTrips();

  const [trip, setTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [isEnding, setIsEnding] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  // One-off message handed over by the page that navigated here.
  const [notice, setNotice] = useState(location.state?.notice ?? "");
  const from = location.state?.from ?? "/app/trips";
  const backLabel = from.startsWith("/app/admin") ? "Back to admin" : "All trips";

  const viewer = { id: user?.id, role: profile?.role };
  const { owner } = useTripOwner(trip, viewer);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError("");
    // Another trip: drop the previous one at once, so neither this page nor
    // the map shows it while the new one loads.
    setTrip((current) => (current?.id === id ? current : null));

    getTrip(id)
      .then((data) => {
        if (isMounted) setTrip(data);
      })
      .catch((err) => {
        if (isMounted) setLoadError(err.message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, reloadKey]);

  // The map shows this trip's itinerary while the page is open, and always
  // the latest version of it (after adding, editing, removing or reordering
  // destinations). Leaving the page, or a failed load, gives the map back.
  const { showTripOnMap, clearTripMap } = useTripMap();
  useEffect(() => {
    if (trip) showTripOnMap(trip);
  }, [trip, showTripOnMap]);
  const shownTripId = trip?.id;
  useEffect(() => {
    if (!shownTripId) return;
    return () => clearTripMap(shownTripId);
  }, [shownTripId, clearTripMap]);

  function handleTripChange(updated) {
    setTrip(updated);
    upsertTrip(updated);
  }

  if (isLoading) return <Spinner label="Loading trip…" />;

  if (loadError) {
    return (
      <EmptyState
        tone="error"
        title="Couldn't load this trip"
        message={loadError}
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              htmlType="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
            <Link to={from} className={buttonClassName({ variant: "ghost", size: "sm" })}>
              {backLabel}
            </Link>
          </>
        }
      />
    );
  }

  const canManage = canManageTrip(trip, viewer, owner?.role);
  // A plain admin can edit someone's trip but not delete it or its photos.
  const canDelete = canManage && canDeleteTrip(trip, viewer);
  const isOwner = canUploadTripPhotos(trip, viewer);
  const days = tripLengthDays(trip.startDate, trip.endDate);

  async function handleConfirmDelete() {
    setIsConfirmingDelete(false);
    setIsDeleting(true);
    setActionError("");
    try {
      await deleteTrip(trip, user?.id);
      removeTrip(trip.id);
      navigate(from, { replace: true });
    } catch (err) {
      setActionError(err.message);
      setIsDeleting(false);
      // Some photos may be gone even though the trip was kept.
      setReloadKey((key) => key + 1);
    }
  }

  return (
    <div className={styles.detail}>
      <div className={styles.topBar}>
        <Link to={from} className={buttonClassName({ variant: "ghost", size: "sm" })}>
          &larr; {backLabel}
        </Link>
      </div>

      <Card as="header" className={styles.hero}>
        <div className={styles.heroMeta}>
          <TripStatusBadge status={trip.status} />
          <span className={styles.duration}>
            {plural(days, "day")}
            {trip.status === "active" && " so far"}
          </span>
        </div>
        <h2 className={styles.title}>{trip.title}</h2>
        <p className={styles.dates}>{formatTripRange(trip.startDate, trip.endDate)}</p>
        <p className={styles.counts}>
          {plural(trip.destinations.length, "destination")}
          <span aria-hidden="true">·</span>
          {plural(trip.photos.length, "photo")}
        </p>
        {owner && (
          <p className={styles.owner}>
            Owner: <strong>{owner.fullName || "Unknown user"}</strong> (
            {ROLE_LABELS[owner.role] ?? owner.role})
          </p>
        )}
        {trip.description && <p className={styles.description}>{trip.description}</p>}

        {canManage && (
          <div className={styles.actions}>
            {trip.status === "active" && (
              <Button
                variant="primary"
                size="sm"
                htmlType="button"
                onClick={() => setIsEnding(true)}
                disabled={isDeleting}
              >
                End trip
              </Button>
            )}
            {!isDeleting && (
              <Link
                to={`/app/trips/${trip.id}/edit`}
                state={{ from }}
                className={buttonClassName({ variant: "outline", size: "sm" })}
              >
                Edit details
              </Link>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="sm"
                htmlType="button"
                className={styles.danger}
                onClick={() => setIsConfirmingDelete(true)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete trip"}
              </Button>
            )}
          </div>
        )}
      </Card>

      {notice && (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <Button variant="ghost" size="sm" htmlType="button" onClick={() => setNotice("")}>
            Dismiss
          </Button>
        </div>
      )}
      {actionError && <FormMessage>{actionError}</FormMessage>}
      {isDeleting && <Spinner label="Deleting trip and its photos…" />}

      <Card className={styles.section}>
        <TripItinerary
          trip={trip}
          canEdit={canManage && !isDeleting}
          canDelete={canDelete && !isDeleting}
          cities={isOwner ? cities : []}
          onTripChange={handleTripChange}
        />
      </Card>

      <Card className={styles.section}>
        <TripGallery
          trip={trip}
          canUpload={isOwner && !isDeleting}
          canManage={canManage && !isDeleting}
          canDelete={canDelete && !isDeleting}
          onTripChange={handleTripChange}
        />
      </Card>

      {isEnding && (
        <EndTripDialog
          trip={trip}
          onEnded={(updated) => {
            handleTripChange(updated);
            setIsEnding(false);
          }}
          onClose={() => setIsEnding(false)}
        />
      )}

      {isConfirmingDelete && (
        <ConfirmDialog
          title="Delete trip?"
          message={
            <>
              Delete <strong>{trip.title}</strong> (
              {formatTripRange(trip.startDate, trip.endDate)}) with its{" "}
              {plural(trip.destinations.length, "destination")} and{" "}
              {plural(trip.photos.length, "photo")}?
            </>
          }
          warning="This can't be undone. Your Cities list isn't affected."
          confirmLabel="Delete trip"
          onConfirm={handleConfirmDelete}
          onCancel={() => setIsConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

// Asks for the end date (today by default) before ending the trip.
function EndTripDialog({ trip, onEnded, onClose }) {
  const titleId = useId();
  const inputId = useId();
  const today = todayIso();
  // Ending now: between the start (or last departure) and today.
  const earliest = latestDeparture(trip.destinations);

  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSaving) return;

    const errors = validateTrip(
      { ...trip, endDate },
      { requireEndDate: true, latestEndDate: today, earliestEndDate: earliest },
    );
    if (hasErrors(errors)) {
      setError(errors.endDate ?? Object.values(errors)[0]);
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      onEnded(await endTrip(trip.id, endDate));
    } catch (err) {
      setError(err.message);
      setIsSaving(false);
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={() => !isSaving && onClose()} size="sm">
      <form className={styles.endForm} onSubmit={handleSubmit} noValidate>
        <h2 id={titleId} className={styles.endTitle}>
          End &ldquo;{trip.title}&rdquo;?
        </h2>
        <p className={styles.endText}>
          The trip moves to your completed trips. You can still edit it, add photos and
          change the end date later.
        </p>
        <Field id={inputId} label="End date" error={error || undefined}>
          <input
            id={inputId}
            type="date"
            value={endDate}
            min={earliest ?? trip.startDate}
            max={today}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </Field>
        <div className={styles.endActions}>
          <Button variant="secondary" htmlType="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" htmlType="submit" disabled={isSaving}>
            {isSaving ? "Ending…" : "End trip"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default TripDetail;
