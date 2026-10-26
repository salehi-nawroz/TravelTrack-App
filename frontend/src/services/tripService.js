import supabase from "./supabaseClient";
import {
  deleteTripPhotos,
  removeLeftoverTripFiles,
  toDomainPhoto,
} from "./tripPhotoService";
import { compareIsoDates } from "../utils/tripDates";

// Trips with their itinerary and photo records in one request. Access is
// decided by RLS (scripts/trips-schema.sql): the owner's own trips, plus -
// for admins - the trips they're allowed to manage.
const TRIP_SELECT = "*, trip_destinations(*), trip_photos(*)";

// Postgres/PostgREST errors -> messages for people. Anything unexpected is
// logged and replaced by the caller's fallback.
function toFriendlyError(error, fallback) {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;

  if (error.code === "23505" && text.includes("trips_one_active_per_user"))
    return new Error("You already have an active trip. End it before starting a new one.");
  if (error.code === "23505" && text.includes("trip_destinations_position_key"))
    return new Error("This itinerary was changed elsewhere. Reload the trip and try again.");
  if (error.code === "23514" && text.includes("trip owner"))
    return new Error("That city belongs to someone else and can't be added to this trip.");
  if (error.code === "23514")
    return new Error("Some of the details aren't valid. Check the dates and try again.");
  if (error.code === "23503")
    return new Error("Remove this trip's photos before deleting it.");
  if (error.code === "42501")
    return new Error("You don't have permission to do that.");
  if (error.code === "PGRST116")
    return new Error("This trip doesn't exist, or you don't have access to it.");

  console.error(fallback, error.message);
  return new Error(fallback);
}

function toDomainDestination(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    cityId: row.city_id,
    cityName: row.city_name,
    country: row.country,
    countryCode: row.country_code,
    region: row.region ?? "",
    position: { lat: row.latitude, lng: row.longitude },
    sortOrder: row.position,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    notes: row.notes ?? "",
  };
}

function toDbDestination(destination) {
  return {
    city_id: destination.cityId ?? null,
    city_name: destination.cityName.trim(),
    country: destination.country.trim(),
    country_code: destination.countryCode.toUpperCase(),
    region: destination.region || null,
    latitude: destination.position.lat,
    longitude: destination.position.lng,
    arrival_date: destination.arrivalDate || null,
    departure_date: destination.departureDate || null,
    notes: destination.notes ?? "",
  };
}

export function toDomainTrip(row) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? "",
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    destinations: (row.trip_destinations ?? [])
      .map(toDomainDestination)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    photos: (row.trip_photos ?? [])
      .map(toDomainPhoto)
      .sort((a, b) => compareIsoDates(a.createdAt, b.createdAt)),
  };
}

// The chosen cover, or the first photo, or null.
export const getCoverPhoto = (trip) =>
  trip.photos.find((photo) => photo.isCover) ?? trip.photos[0] ?? null;

async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) throw new Error("User is not authenticated.");

  return user.id;
}

// --- Trips ---

export async function getMyTrips() {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  if (error) throw toFriendlyError(error, "Couldn't load your trips.");
  return data.map(toDomainTrip);
}

// Admin dashboard: every trip RLS lets the caller see.
export async function getAllTrips() {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .order("start_date", { ascending: false });

  if (error) throw toFriendlyError(error, "Couldn't load trips.");
  return data.map(toDomainTrip);
}

export async function getTrip(id) {
  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_SELECT)
    .eq("id", id)
    .single();

  if (error) throw toFriendlyError(error, "Couldn't load this trip.");
  return toDomainTrip(data);
}

// user_id is never sent: the database fills it with the signed-in user.
export async function createTrip({ title, description = "", startDate }) {
  const { data, error } = await supabase
    .from("trips")
    .insert({ title: title.trim(), description, start_date: startDate })
    .select(TRIP_SELECT)
    .single();

  if (error) throw toFriendlyError(error, "Couldn't start this trip.");
  return toDomainTrip(data);
}

export async function updateTrip(id, { title, description = "", startDate, endDate }) {
  const { data, error } = await supabase
    .from("trips")
    .update({
      title: title.trim(),
      description,
      start_date: startDate,
      end_date: endDate || null,
    })
    .eq("id", id)
    .select(TRIP_SELECT)
    .single();

  if (error) throw toFriendlyError(error, "Couldn't save this trip.");
  return toDomainTrip(data);
}

// Only ends a trip that is still active.
export async function endTrip(id, endDate) {
  const { data, error } = await supabase
    .from("trips")
    .update({ end_date: endDate })
    .eq("id", id)
    .is("end_date", null)
    .select(TRIP_SELECT)
    .single();

  if (error) throw toFriendlyError(error, "Couldn't end this trip.");
  return toDomainTrip(data);
}

// Photos first, trip last: the trip row is only deleted once every one of
// its photo records - and so every file - is gone (the database enforces
// the same order). If any photo can't be removed, the trip is kept and an
// error says so; the photos that did go stay gone, and trying again picks
// up where this left off. Destinations go with the trip (cascade).
//   viewerId: the signed-in user; when it's the owner, files left behind by
//             failed uploads are cleared from the trip's folder too.
export async function deleteTrip(trip, viewerId) {
  const { data: photoRows, error: photosError } = await supabase
    .from("trip_photos")
    .select("*")
    .eq("trip_id", trip.id);

  if (photosError) throw toFriendlyError(photosError, "Couldn't delete this trip.");

  const { failed } = await deleteTripPhotos(photoRows.map(toDomainPhoto));
  if (failed.length) {
    throw new Error(
      `${failed.length} of ${photoRows.length} photos couldn't be removed, so the trip was kept. Please try again.`,
    );
  }

  if (viewerId && viewerId === trip.userId) {
    await removeLeftoverTripFiles(trip.userId, trip.id);
  }

  const { data, error } = await supabase
    .from("trips")
    .delete()
    .eq("id", trip.id)
    .select("id");

  if (error) throw toFriendlyError(error, "Couldn't delete this trip.");
  if (!data.length) throw new Error("This trip doesn't exist, or you can't delete it.");
}

// --- Destinations ---

export async function addDestination(trip, destination) {
  const nextOrder =
    trip.destinations.reduce((max, d) => Math.max(max, d.sortOrder), -1) + 1;

  const { data, error } = await supabase
    .from("trip_destinations")
    .insert({ ...toDbDestination(destination), trip_id: trip.id, position: nextOrder })
    .select()
    .single();

  if (error) throw toFriendlyError(error, "Couldn't add this destination.");
  return toDomainDestination(data);
}

export async function updateDestination(id, destination) {
  const { data, error } = await supabase
    .from("trip_destinations")
    .update(toDbDestination(destination))
    .eq("id", id)
    .select()
    .single();

  if (error) throw toFriendlyError(error, "Couldn't save this destination.");
  return toDomainDestination(data);
}

export async function deleteDestination(id) {
  const { data, error } = await supabase
    .from("trip_destinations")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw toFriendlyError(error, "Couldn't remove this destination.");
  if (!data.length) {
    throw new Error("This destination no longer exists, or you don't have permission to remove it.");
  }
}

// orderedIds must list every destination of the trip exactly once.
export async function reorderDestinations(tripId, orderedIds) {
  const { error } = await supabase.rpc("reorder_trip_destinations", {
    p_trip_id: tripId,
    p_destination_ids: orderedIds,
  });

  if (error) throw toFriendlyError(error, "Couldn't reorder the itinerary.");
}
