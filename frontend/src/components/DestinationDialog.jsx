import { useId, useState } from "react";
import Button from "./Button";
import DestinationPlacePicker from "./DestinationPlacePicker";
import Dialog from "./Dialog";
import Field, { FormMessage } from "./Field";
import styles from "./DestinationDialog.module.css";
import { NOTES_MAX, hasErrors, validateDestination } from "../utils/tripValidation";
import { toIsoDate } from "../utils/tripDates";

// Add or edit one destination of a trip: the place (see
// DestinationPlacePicker), optional arrival/departure dates and notes.
//   cities:   the owner's cities to pick from ([] when not available, e.g.
//             an admin editing someone else's trip)
//   onSubmit: async (destination) => void; errors it throws are shown
function DestinationDialog({ trip, destination, cities, onSubmit, onClose }) {
  const titleId = useId();
  const idPrefix = useId();
  const id = (name) => `${idPrefix}-${name}`;
  const isEditing = Boolean(destination);

  const [place, setPlace] = useState(
    destination
      ? {
          cityId: destination.cityId,
          cityName: destination.cityName,
          country: destination.country,
          countryCode: destination.countryCode,
          region: destination.region,
          position: destination.position,
        }
      : null,
  );
  const [arrivalDate, setArrivalDate] = useState(destination?.arrivalDate ?? "");
  const [departureDate, setDepartureDate] = useState(destination?.departureDate ?? "");
  const [notes, setNotes] = useState(destination?.notes ?? "");
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handlePlaceChange(next, city) {
    setPlace(next);
    setErrors((current) => ({ ...current, place: undefined }));

    // A city's visit date is a sensible default arrival when it fits the trip.
    const visit = city?.date ? toIsoDate(new Date(city.date)) : "";
    if (
      !arrivalDate &&
      visit &&
      visit >= trip.startDate &&
      (!trip.endDate || visit <= trip.endDate)
    ) {
      setArrivalDate(visit);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const values = { ...place, arrivalDate, departureDate, notes };
    const validation = validateDestination(values, trip);
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSubmitError("");
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err.message);
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      labelledBy={titleId}
      onClose={() => !isSubmitting && onClose()}
      size="md"
      showCloseButton
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <h2 id={titleId} className={styles.title}>
          {isEditing ? "Edit destination" : "Add a destination"}
        </h2>

        <DestinationPlacePicker
          cities={cities}
          place={place}
          onPlaceChange={handlePlaceChange}
          error={errors.place}
        />

        <div className={styles.dates}>
          <Field id={id("arrival")} label="Arrival (optional)" error={errors.arrivalDate}>
            <input
              id={id("arrival")}
              type="date"
              value={arrivalDate}
              min={trip.startDate}
              max={trip.endDate ?? undefined}
              onChange={(e) => setArrivalDate(e.target.value)}
            />
          </Field>
          <Field id={id("departure")} label="Departure (optional)" error={errors.departureDate}>
            <input
              id={id("departure")}
              type="date"
              value={departureDate}
              min={arrivalDate || trip.startDate}
              max={trip.endDate ?? undefined}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
          </Field>
        </div>

        <Field
          id={id("notes")}
          label="Notes (optional)"
          hint={`${notes.length}/${NOTES_MAX}`}
          error={errors.notes}
        >
          <textarea
            id={id("notes")}
            rows={3}
            value={notes}
            maxLength={NOTES_MAX}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {submitError && <FormMessage>{submitError}</FormMessage>}

        <div className={styles.actions}>
          <Button variant="secondary" htmlType="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" htmlType="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : isEditing ? "Save destination" : "Add destination"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export default DestinationDialog;
