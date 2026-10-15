import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import Card from "./Card";
import EmptyState from "./EmptyState";
import PageHeader from "./PageHeader";
import Spinner from "./Spinner";
import TripDetailsForm from "./TripDetailsForm";
import Button from "./Button";
import { buttonClassName } from "./buttonClassName";
import { useAuth } from "../contexts/AuthContext";
import { useCities } from "../contexts/CitiesContext";
import { useTrips } from "../contexts/tripsContext";
import { useTripOwner } from "../hooks/useTripOwner";
import { addDestination, getTrip, updateTrip } from "../services/tripService";
import { setTripCover, uploadTripPhoto } from "../services/tripPhotoService";
import { canManageTrip } from "../utils/tripPermissions";
import { latestDeparture } from "../utils/tripValidation";
import styles from "./TripForm.module.css";

// /app/trips/new (start a trip, optionally with its first destination and
// a cover photo) and /app/trips/:id/edit (edit its details). Further
// destinations and photos are managed on the trip's own page.
function TripForm() {
  const { id } = useParams();
  return id ? <EditTrip id={id} /> : <StartTrip />;
}

function StartTrip() {
  const navigate = useNavigate();
  const { activeTrip, isLoading, createTrip, upsertTrip } = useTrips();
  const { cities } = useCities();
  const [status, setStatus] = useState("");

  const header = (
    <PageHeader
      title="Start a trip"
      note="Add destinations and photos as you travel, then end the trip when you're home."
    />
  );

  if (isLoading) return <Spinner label="Loading your trips…" />;

  // One active trip at a time (the database enforces it too).
  if (activeTrip) {
    return (
      <div className={styles.page}>
        {header}
        <EmptyState
          icon="trips"
          title="You already have an active trip"
          message={`End "${activeTrip.title}" before starting a new one.`}
          action={
            <Link
              to={`/app/trips/${activeTrip.id}`}
              className={buttonClassName({ variant: "primary", size: "sm" })}
            >
              Go to current trip
            </Link>
          }
        />
      </div>
    );
  }

  async function handleSubmit(values, coverFile, firstPlace) {
    setStatus("Starting your trip…");
    let trip = await createTrip(values);

    // The trip exists from here on; a problem with the first destination or
    // the cover is reported on its page instead of failing the whole form.
    const problems = [];

    if (firstPlace) {
      try {
        setStatus("Adding the first destination…");
        const destination = await addDestination(trip, {
          ...firstPlace,
          arrivalDate: values.startDate,
          departureDate: "",
          notes: "",
        });
        trip = { ...trip, destinations: [destination] };
        upsertTrip(trip);
      } catch (err) {
        problems.push(`the first destination wasn't added (${err.message})`);
      }
    }

    if (coverFile) {
      try {
        setStatus("Uploading cover photo…");
        const photo = await uploadTripPhoto(trip, coverFile, {
          onProgress: (percent) => setStatus(`Uploading cover photo… ${percent}%`),
        });
        await setTripCover(photo.id);
        upsertTrip({ ...trip, photos: [{ ...photo, isCover: true }] });
      } catch (err) {
        problems.push(`the cover photo wasn't added (${err.message})`);
      }
    }

    const notice = problems.length
      ? `Your trip has started, but ${problems.join(" and ")}. You can add it from this page.`
      : "";
    navigate(`/app/trips/${trip.id}`, { replace: true, state: { notice } });
  }

  return (
    <div className={styles.page}>
      {header}
      <Card className={styles.card}>
        <TripDetailsForm
          mode="create"
          cities={cities}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/app/trips")}
          submitLabel="Start trip"
          busyLabel="Starting…"
          statusMessage={status}
        />
      </Card>
    </div>
  );
}

function EditTrip({ id }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { upsertTrip } = useTrips();

  const [trip, setTrip] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Where the trip page should return to (the Admin dashboard, when an
  // admin came from there).
  const from = location.state?.from;
  const viewer = { id: user?.id, role: profile?.role };
  const { owner, isLoading: isLoadingOwner } = useTripOwner(trip, viewer);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError("");

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

  if (isLoading || isLoadingOwner) return <Spinner label="Loading trip…" />;

  if (loadError) {
    return (
      <EmptyState
        tone="error"
        title="Couldn't load this trip"
        message={loadError}
        action={
          <Button
            variant="outline"
            size="sm"
            htmlType="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Try again
          </Button>
        }
      />
    );
  }

  // The database decides in the end; this just avoids offering a form
  // that can't be saved.
  if (!canManageTrip(trip, viewer, owner?.role)) {
    return (
      <EmptyState
        tone="error"
        title="You can't edit this trip"
        action={
          <Link
            to="/app/trips"
            className={buttonClassName({ variant: "outline", size: "sm" })}
          >
            Back to trips
          </Link>
        }
      />
    );
  }

  async function handleSubmit(values) {
    const updated = await updateTrip(trip.id, values);
    upsertTrip(updated);
    navigate(`/app/trips/${trip.id}`, { replace: true, state: { from } });
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Edit trip" summary={trip.title} />
      <Card className={styles.card}>
        <TripDetailsForm
          mode="edit"
          initial={trip}
          earliestEndDate={latestDeparture(trip.destinations)}
          onSubmit={handleSubmit}
          onCancel={() => navigate(`/app/trips/${trip.id}`, { state: { from } })}
          submitLabel="Save changes"
        />
      </Card>
    </div>
  );
}

export default TripForm;
