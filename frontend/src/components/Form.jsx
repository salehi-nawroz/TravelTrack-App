import { useEffect, useState } from "react";

import styles from "./Form.module.css";
import Message from "./Message";
import Spinner from "./Spinner";
import Button from "./Button";
import BackButton from "./BackButton";
import Card from "./Card";
import Field from "./Field";
import { useUrlPosition } from "../hooks/useUrlPosition";
import FlagBox from "./FlagBox";
import LocationSearch from "./LocationSearch";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useCities } from "../contexts/CitiesContext";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getCityData } from "../services/geocodingService";
function Form() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = Boolean(id);
  const isSelectingLocation = searchParams.get("selectLocation") === "true";
  const locationSource = searchParams.get("locationSource");
  const { createCity, updateCity, getCity, currentCity, isLoading, error } =
    useCities();
  const { lat, lng } = useUrlPosition();
  const [isLoadingGeocoding, setIsLoadingGeocoding] = useState(false);

  const [cityName, setCityName] = useState("");
  const [country, setCountry] = useState("");
  const [date, setDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [position, setPosition] = useState(null);
  const [geocodingError, setGeocodingError] = useState("");
  const [validationError, setValidationError] = useState("");

  void country;
  useEffect(() => {
    if (isEditMode && !isSelectingLocation) {
      getCity(id);
      return;
    }

    if (locationSource === "search") return;

    async function fetchCityData() {
      if (!lat || !lng) return;

      try {
        setIsLoadingGeocoding(true);
        setGeocodingError("");

        const location = await getCityData(lat, lng);

        if (!location) {
          throw new Error(
            "This location doesn't seem to be a city. Click somewhere else 🙂",
          );
        }

        applyLocation(location);

        if (isEditMode)
          navigate(
            `/app/cities/${id}/edit?locationSource=map&lat=${lat}&lng=${lng}`,
            { replace: true },
          );
      } catch (error) {
        setGeocodingError(error.message);
      } finally {
        setIsLoadingGeocoding(false);
      }
    }

    fetchCityData();
  }, [
    getCity,
    id,
    isEditMode,
    isSelectingLocation,
    lat,
    lng,
    locationSource,
    navigate,
  ]);

  useEffect(() => {
    if (!isEditMode || String(currentCity.id) !== String(id)) return;

    setCityName(currentCity.cityName || "");
    setCountry(currentCity.country || "");
    setDate(currentCity.date ? new Date(currentCity.date) : null);
    setNotes(currentCity.notes || "");
    setCountryCode(currentCity.countryCode || "");
    setPosition(currentCity.position || null);
  }, [currentCity, id, isEditMode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (isLoading) return;

    if (!cityName.trim() || !date) {
      setValidationError("Please provide a city name and visit date.");
      return;
    }

    setValidationError("");
    const city = {
      cityName,
      country,
      date,
      countryCode,
      notes,
      position: position || { lat, lng },
    };

    const savedCity = isEditMode
      ? await updateCity(id, {
          ...currentCity,
          ...city,
        })
      : await createCity(city);

    if (savedCity) navigate(isEditMode ? `/app/cities/${id}` : "/app/cities");
  }

  function handleCancel(e) {
    e.preventDefault();
    navigate(isEditMode ? `/app/cities/${id}` : "/app/cities");
  }

  function applyLocation(location) {
    setCityName(location.cityName);
    setCountry(location.country);
    setCountryCode(location.countryCode);
    setPosition(location.position);
  }

  function handleSelectLocation() {
    setGeocodingError("");
    navigate(
      isEditMode
        ? `/app/cities/${id}/edit?selectLocation=true`
        : "/app/form?selectLocation=true",
    );
  }

  function handleSearchSelect(location) {
    applyLocation(location);

    const path = isEditMode ? `/app/cities/${id}/edit` : "/app/form";
    navigate(
      `${path}?locationSource=search&lat=${location.position.lat}&lng=${location.position.lng}`,
      { replace: true },
    );
  }

  if (geocodingError && !isEditMode)
    return <Message message={geocodingError} />;
  if (isEditMode && error && String(currentCity.id) !== String(id))
    return <Message message={error} />;
  if (isEditMode && (isLoading || String(currentCity.id) !== String(id)))
    return <Spinner />;
  if (isLoadingGeocoding) return <Spinner />;
  if (!isEditMode && !lat && !lng)
    return (
      <Message message="Click a city on the map or search on the map to add a city" />
    );
  return (
    <Card
      as="form"
      className={`${styles.form} ${isLoading ? styles.loading : ""}`}
      onSubmit={handleSubmit}
    >
      <h2>{isEditMode ? "Edit city" : "Add a new city"}</h2>

      {(validationError || error || (isEditMode && geocodingError)) && (
        <Message message={validationError || error || geocodingError} />
      )}

      {isSelectingLocation && (
        <Message message="Click on the map to select a new city." />
      )}

      <Field
        id="cityName"
        label="City name"
        className={styles.row}
        hint={isEditMode ? "Select a new city from the map" : null}
      >
        {isEditMode ? (
          <button
            id="cityName"
            type="button"
            className={styles.citySelector}
            onClick={handleSelectLocation}
          >
            <span>{cityName}</span>
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        ) : (
          <input
            id="cityName"
            onChange={(e) => setCityName(e.target.value)}
            value={cityName}
          />
        )}
        <FlagBox countryCode={countryCode} country={country} />
        <input type="hidden" id="countryCode" value={countryCode}></input>
      </Field>

      <LocationSearch onSelect={handleSearchSelect} />

      <Button type="back" onClick={handleSelectLocation}>
        Select from map
      </Button>

      <Field
        id="date"
        label={`When did you go to ${cityName}?`}
        className={styles.row}
      >
        <DatePicker
          id="date"
          onChange={(date) => setDate(date)}
          selected={date}
          dateFormat="dd/MM/yyyy"
        />
      </Field>

      <Field
        id="notes"
        label={`Notes about your trip to ${cityName}`}
        className={styles.row}
      >
        <textarea
          id="notes"
          onChange={(e) => setNotes(e.target.value)}
          value={notes}
        />
      </Field>

      <div className={styles.buttons}>
        <Button type="primary" disabled={isLoading}>
          {isEditMode ? "Save changes" : "Add"}
        </Button>
        {isEditMode ? (
          <Button type="back" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
        ) : (
          <BackButton />
        )}
      </div>
    </Card>
  );
}

export default Form;
