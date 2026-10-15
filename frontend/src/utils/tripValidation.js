import { isIsoDate } from "./tripDates";

// Limits mirror the CHECK constraints in scripts/trips-schema.sql, so the
// form catches problems before the database rejects them.
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const NOTES_MAX = 1000;

// Returns { field: message } for every invalid field; empty when valid.
//   requireEndDate:  the "End trip" step, where an end date is mandatory.
//   latestEndDate:   the end date can't be after this (today, when ending
//                    a trip now).
//   earliestEndDate: the end date can't be before this (the last
//                    departure in the itinerary).
export function validateTrip(
  { title, description = "", startDate, endDate },
  { requireEndDate = false, latestEndDate, earliestEndDate } = {},
) {
  const errors = {};
  const trimmedTitle = title?.trim() ?? "";

  if (!trimmedTitle) errors.title = "Give your trip a title.";
  else if (trimmedTitle.length > TITLE_MAX)
    errors.title = `Keep the title under ${TITLE_MAX} characters.`;

  if (description.length > DESCRIPTION_MAX)
    errors.description = `Keep the description under ${DESCRIPTION_MAX} characters.`;

  if (!startDate) errors.startDate = "Choose the date the trip started.";
  else if (!isIsoDate(startDate)) errors.startDate = "Enter a valid date.";

  if (!endDate) {
    if (requireEndDate) errors.endDate = "Choose the date the trip ended.";
  } else if (!isIsoDate(endDate)) {
    errors.endDate = "Enter a valid date.";
  } else if (isIsoDate(startDate) && endDate < startDate) {
    errors.endDate = "The end date can't be before the start date.";
  } else if (earliestEndDate && endDate < earliestEndDate) {
    errors.endDate = "The end date can't be before the last departure in the itinerary.";
  } else if (latestEndDate && endDate > latestEndDate) {
    errors.endDate = "The end date can't be in the future.";
  }

  return errors;
}

// Latest departure date in an itinerary, or undefined.
export const latestDeparture = (destinations) =>
  destinations
    .map((d) => d.departureDate)
    .filter(Boolean)
    .sort()
    .at(-1);

// Destination dates must be in order and, when given, inside the trip's
// dates (an active trip has no end yet, so only the start bounds it).
export function validateDestination(
  { cityName, country, countryCode, position, arrivalDate, departureDate, notes = "" },
  trip,
) {
  const errors = {};

  if (
    !cityName?.trim() ||
    !country?.trim() ||
    countryCode?.length !== 2 ||
    !Number.isFinite(position?.lat) ||
    !Number.isFinite(position?.lng)
  ) {
    errors.place = "Choose a place for this destination.";
  }

  if (arrivalDate && !isIsoDate(arrivalDate))
    errors.arrivalDate = "Enter a valid date.";
  else if (arrivalDate && trip?.startDate && arrivalDate < trip.startDate)
    errors.arrivalDate = "Arrival can't be before the trip started.";
  else if (arrivalDate && trip?.endDate && arrivalDate > trip.endDate)
    errors.arrivalDate = "Arrival can't be after the trip ended.";

  if (departureDate && !isIsoDate(departureDate))
    errors.departureDate = "Enter a valid date.";
  else if (departureDate && arrivalDate && departureDate < arrivalDate)
    errors.departureDate = "Departure can't be before arrival.";
  else if (departureDate && trip?.startDate && departureDate < trip.startDate)
    errors.departureDate = "Departure can't be before the trip started.";
  else if (departureDate && trip?.endDate && departureDate > trip.endDate)
    errors.departureDate = "Departure can't be after the trip ended.";

  if (notes.length > NOTES_MAX)
    errors.notes = `Keep notes under ${NOTES_MAX} characters.`;

  return errors;
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;
