import { useEffect, useId, useState } from "react";
import Button from "./Button";
import DestinationPlacePicker from "./DestinationPlacePicker";
import Field, { FormMessage } from "./Field";
import styles from "./TripDetailsForm.module.css";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  hasErrors,
  validateTrip,
} from "../utils/tripValidation";
import { todayIso } from "../utils/tripDates";
import {
  ACCEPTED_PHOTO_TYPES,
  validateTripPhoto,
} from "../services/tripPhotoService";

// Title, description and dates of a trip; used to start a trip and to
// edit one (including from the Admin dashboard).
//   mode:        "create" (no end date; optional first destination and
//                cover photo) | "edit"
//   initial:     { title, description, startDate, endDate }
//   cities:      the user's cities, for the first destination (create)
//   earliestEndDate: edit - the end date can't be before this (the last
//                departure in the itinerary)
//   onSubmit:    async (values, coverFile, firstPlace) => void - errors it
//                throws are shown above the buttons
//   submitLabel / busyLabel: button text while idle / while saving
function TripDetailsForm({
  mode = "create",
  initial = {},
  cities = [],
  earliestEndDate,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  busyLabel = "Saving…",
  statusMessage,
}) {
  const idPrefix = useId();
  const id = (name) => `${idPrefix}-${name}`;

  const [values, setValues] = useState({
    title: initial.title ?? "",
    description: initial.description ?? "",
    startDate: initial.startDate ?? todayIso(),
    endDate: initial.endDate ?? "",
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [firstPlace, setFirstPlace] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [coverError, setCoverError] = useState("");

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) {
      setErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  function handleCoverChange(e) {
    const file = e.target.files?.[0] ?? null;
    const error = file ? validateTripPhoto(file) : null;
    setCoverError(error ?? "");
    setCoverFile(error ? null : file);
    if (error) e.target.value = "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = validateTrip(values, { earliestEndDate });
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSubmitError("");
    setIsSubmitting(true);
    try {
      await onSubmit(
        { ...values, title: values.title.trim(), endDate: values.endDate || null },
        coverFile,
        firstPlace,
      );
    } catch (err) {
      setSubmitError(err.message);
      setIsSubmitting(false);
    }
    // On success the caller navigates away or closes the form.
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Field id={id("title")} label="Trip title" error={errors.title}>
        <input
          id={id("title")}
          type="text"
          value={values.title}
          maxLength={TITLE_MAX}
          onChange={(e) => update("title", e.target.value)}
          placeholder="e.g. Summer in Portugal"
          required
          aria-required="true"
          autoComplete="off"
        />
      </Field>

      <Field
        id={id("description")}
        label="Description (optional)"
        hint={`${values.description.length}/${DESCRIPTION_MAX}`}
        error={errors.description}
      >
        <textarea
          id={id("description")}
          rows={4}
          value={values.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => update("description", e.target.value)}
          placeholder="What's this trip about?"
        />
      </Field>

      <div className={styles.dates}>
        <Field id={id("startDate")} label="Start date" error={errors.startDate}>
          <input
            id={id("startDate")}
            type="date"
            value={values.startDate}
            onChange={(e) => update("startDate", e.target.value)}
            required
            aria-required="true"
          />
        </Field>

        {mode === "edit" && (
          <Field
            id={id("endDate")}
            label="End date"
            hint="Leave empty while the trip is still going."
            error={errors.endDate}
          >
            <input
              id={id("endDate")}
              type="date"
              value={values.endDate ?? ""}
              min={
                [values.startDate, earliestEndDate].filter(Boolean).sort().at(-1) ||
                undefined
              }
              onChange={(e) => update("endDate", e.target.value)}
            />
          </Field>
        )}
      </div>

      {mode === "create" && (
        <div className={styles.firstPlace}>
          <DestinationPlacePicker
            legend="First destination (optional)"
            cities={cities}
            place={firstPlace}
            onPlaceChange={setFirstPlace}
            onClear={() => setFirstPlace(null)}
          />
          <p className={styles.firstPlaceHint}>
            Where the trip starts. It&apos;s added to the itinerary with the start date as
            its arrival; you can add more destinations as you travel.
          </p>
        </div>
      )}

      {mode === "create" && (
        <Field
          id={id("cover")}
          label="Cover photo (optional)"
          hint="JPEG, PNG or WEBP, up to 5MB. You can add more photos later."
          error={coverError}
        >
          <input
            id={id("cover")}
            type="file"
            accept={ACCEPTED_PHOTO_TYPES}
            onChange={handleCoverChange}
            className={styles.fileInput}
          />
        </Field>
      )}

      {coverPreview && (
        <div className={styles.coverPreview}>
          <img src={coverPreview} alt="Selected cover photo preview" />
          <Button
            variant="ghost"
            size="sm"
            htmlType="button"
            onClick={() => setCoverFile(null)}
          >
            Remove photo
          </Button>
        </div>
      )}

      {submitError && <FormMessage>{submitError}</FormMessage>}
      {isSubmitting && statusMessage && (
        <p className={styles.status} role="status">
          {statusMessage}
        </p>
      )}

      <div className={styles.actions}>
        {onCancel && (
          <Button
            variant="secondary"
            htmlType="button"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button variant="primary" htmlType="submit" disabled={isSubmitting}>
          {isSubmitting ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default TripDetailsForm;
