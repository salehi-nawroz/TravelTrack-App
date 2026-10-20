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
import { COUNTRIES, getCountryName } from "../utils/countries";

const GEOCODING_UNAVAILABLE =
  "We couldn't look up this place. Enter the city and country yourself; the pin stays where you clicked.";
const NOT_A_CITY =
  "This spot doesn't match a city. Enter the city and country yourself, or click somewhere else on the map.";

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
  const [region, setRegion] = useState("");
  const [position, setPosition] = useState(null);
  const [geocodingError, setGeocodingError] = useState("");
  const [validationError, setValidationError] = useState("");
  // Reverse geocoding failed for a new city: keep the clicked coordinates
  // and let the user type the city and pick the country.
  const [isManualLocation, setIsManualLocation] = useState(false);

  useEffect(() => {
    if (isEditMode && !isSelectingLocation) {
      getCity(id);
      return;
    }

    if (locationSource === "search") return;

    async function fetchCityData() {
      if (!lat || !lng) return;

      let location = null;
      let message = "";
      try {
        setIsLoadingGeocoding(true);
        setGeocodingError("");
        location = await getCityData(lat, lng);
        if (!location) message = NOT_A_CITY;
      } catch (err) {
        console.error("Reverse geocoding failed:", err.message);
        message = GEOCODING_UNAVAILABLE;
      }

      try {
        if (location) {
          applyLocation(location);
          if (isEditMode)
            navigate(
              `/app/cities/${id}/edit?locationSource=map&lat=${lat}&lng=${lng}`,
              { replace: true },
            );
        } else if (isEditMode) {
          // Editing keeps the city's current place; just say why.
          setGeocodingError(message);
        } else {
          setIsManualLocation(true);
          setGeocodingError(message);
          setCityName("");
          setCountry("");
          setCountryCode("");
          setRegion("");
          setPosition({ lat: Number(lat), lng: Number(lng) });
        }
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
    setRegion(currentCity.region || "");
    setPosition(currentCity.position || null);
  }, [currentCity, id, isEditMode]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (isLoading) return;

    if (!cityName.trim() || !date) {
      setValidationError("Please provide a city name and visit date.");
      return;
    }
    const code = countryCode.trim().toUpperCase();
    if (!country.trim() || !/^[A-Z]{2}$/.test(code)) {
      setValidationError("Please choose the country.");
      return;
    }

    setValidationError("");
    const city = {
      cityName: cityName.trim(),
      country,
      date,
      countryCode: code,
      region: region || null,
      notes,
      position: position || { lat: Number(lat), lng: Number(lng) },
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
    setIsManualLocation(false);
    setGeocodingError("");
    setCityName(location.cityName);
    setCountry(location.country);
    setCountryCode(location.countryCode);
    setRegion(location.region || "");
    setPosition(location.position);
  }

  function handleCountryChange(e) {
    const code = e.target.value;
    setCountryCode(code);
    setCountry(getCountryName(code));
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

      {(validationError || error || geocodingError) && (
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
        {!isManualLocation && (
          <input type="hidden" id="countryCode" value={countryCode}></input>
        )}
      </Field>

      {isManualLocation && (
        <Field id="countryCode" label="Country" className={styles.row}>
          <select id="countryCode" value={countryCode} onChange={handleCountryChange}>
            <option value="">Choose a country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}

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
