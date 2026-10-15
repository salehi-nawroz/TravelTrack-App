import { useId, useState } from "react";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import DestinationDialog from "./DestinationDialog";
import EmptyState from "./EmptyState";
import FlagBox from "./FlagBox";
import { FormMessage } from "./Field";
import {
  addDestination,
  deleteDestination,
  reorderDestinations,
  updateDestination,
} from "../services/tripService";
import { formatStayRange, formatTripDate } from "../utils/tripDates";
import styles from "./TripItinerary.module.css";

function stayLabel({ arrivalDate, departureDate }) {
  if (arrivalDate && departureDate) {
    return arrivalDate === departureDate
      ? formatTripDate(arrivalDate)
      : formatStayRange(arrivalDate, departureDate);
  }
  if (arrivalDate) return `Arrived ${formatTripDate(arrivalDate)}`;
  if (departureDate) return `Left ${formatTripDate(departureDate)}`;
  return "";
}

// A trip's destinations in travel order, with add / edit / remove and
// move up / move down (buttons, so reordering works from the keyboard and
// on touch screens without drag and drop).
//   canEdit:      show the editing controls (the database decides anyway)
//   cities:       the owner's cities for the destination picker
//   onTripChange: receives the trip with its updated destinations
function TripItinerary({ trip, canEdit, cities = [], onTripChange }) {
  const titleId = useId();
  const [dialog, setDialog] = useState(null); // { destination? } while open
  const [pendingRemove, setPendingRemove] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const destinations = trip.destinations;
  const withDestinations = (list) => onTripChange({ ...trip, destinations: list });

  async function handleSave(values) {
    if (dialog.destination) {
      const saved = await updateDestination(dialog.destination.id, values);
      withDestinations(destinations.map((d) => (d.id === saved.id ? saved : d)));
    } else {
      const saved = await addDestination(trip, values);
      withDestinations([...destinations, saved]);
    }
    setDialog(null);
  }

  async function handleMove(index, offset) {
    const target = index + offset;
    if (busyId || target < 0 || target >= destinations.length) return;

    const previous = destinations;
    const reordered = [...destinations];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const moved = reordered[target];

    setError("");
    setBusyId(moved.id);
    // Show the new order right away; put it back if saving fails.
    withDestinations(reordered.map((d, i) => ({ ...d, sortOrder: i })));
    try {
      await reorderDestinations(trip.id, reordered.map((d) => d.id));
      setAnnouncement(`${moved.cityName} moved to stop ${target + 1} of ${reordered.length}.`);
    } catch (err) {
      withDestinations(previous);
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmRemove() {
    const destination = pendingRemove;
    setPendingRemove(null);
    setError("");
    setBusyId(destination.id);
    try {
      await deleteDestination(destination.id);
      withDestinations(destinations.filter((d) => d.id !== destination.id));
      setAnnouncement(`${destination.cityName} removed from the itinerary.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.itinerary} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h3 id={titleId} className={styles.title}>
          Itinerary
          <span className={styles.count}>{destinations.length}</span>
        </h3>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            htmlType="button"
            onClick={() => setDialog({})}
          >
            + Add destination
          </Button>
        )}
      </div>

      {error && <FormMessage>{error}</FormMessage>}
      <p className={styles.srOnly} role="status">
        {announcement}
      </p>

      {!destinations.length ? (
        <EmptyState
          compact
          icon="cities"
          title="No destinations yet"
          message={
            canEdit
              ? "Add the places you visit on this trip, in the order you visit them."
              : undefined
          }
        />
      ) : (
        <ol className={styles.stops}>
          {destinations.map((destination, index) => {
            const isBusy = busyId === destination.id;
            const stay = stayLabel(destination);
            return (
              <li key={destination.id} className={styles.stop}>
                <span className={styles.marker} aria-hidden="true">
                  {index + 1}
                </span>

                <div className={styles.stopBody}>
                  <div className={styles.place}>
                    <FlagBox
                      countryCode={destination.countryCode}
                      country={destination.country}
                      position="left"
                    />
                    <span className={styles.placeText}>
                      <strong className={styles.cityName}>{destination.cityName}</strong>
                      <span className={styles.country}>
                        {[destination.region, destination.country].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  </div>
                  {stay && <p className={styles.stay}>{stay}</p>}
                  {destination.notes && <p className={styles.notes}>{destination.notes}</p>}
                </div>

                {canEdit && (
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      htmlType="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0 || Boolean(busyId)}
                      aria-label={`Move ${destination.cityName} earlier`}
                      title="Move earlier"
                    >
                      &uarr;
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      htmlType="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === destinations.length - 1 || Boolean(busyId)}
                      aria-label={`Move ${destination.cityName} later`}
                      title="Move later"
                    >
                      &darr;
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      htmlType="button"
                      onClick={() => setDialog({ destination })}
                      disabled={isBusy}
                      aria-label={`Edit ${destination.cityName}`}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      htmlType="button"
                      className={styles.remove}
                      onClick={() => setPendingRemove(destination)}
                      disabled={isBusy}
                      aria-label={`Remove ${destination.cityName}`}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {dialog && (
        <DestinationDialog
          trip={trip}
          destination={dialog.destination}
          cities={cities}
          onSubmit={handleSave}
          onClose={() => setDialog(null)}
        />
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove destination?"
          message={
            <>
              Remove <strong>{pendingRemove.cityName}</strong> from{" "}
              <strong>{trip.title}</strong>?
            </>
          }
          warning={
            pendingRemove.cityId
              ? "The city stays in your Cities list."
              : "Its dates and notes will be lost."
          }
          confirmLabel="Remove"
          onConfirm={handleConfirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </section>
  );
}

export default TripItinerary;
