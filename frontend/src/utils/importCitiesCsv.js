// Parsing + validation for the Cities CSV import. Pure functions only - the
// actual insert goes through CitiesContext.importCities -> cityService
// .createCity, which takes the owner from the signed-in session, never from
// the file.

export const MAX_IMPORT_FILE_BYTES = 1024 * 1024; // 1MB
export const MAX_IMPORT_ROWS = 500;

// Header (lower-cased) -> field. Matches exportCitiesCsv's headers; any other
// column (e.g. an "id" or "user_id" someone added) is ignored.
const HEADER_TO_FIELD = {
  city: "cityName",
  country: "country",
  "country code": "countryCode",
  "visit date": "date",
  notes: "notes",
  latitude: "lat",
  longitude: "lng",
};
const REQUIRED_HEADERS = ["city", "country", "visit date", "latitude", "longitude"];

// RFC 4180 parser: quoted fields may contain commas, "" (an escaped quote)
// and line breaks; rows end in \n or \r\n. Returns { rows } or { error }.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM written by the exporter

  for (; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (inQuotes) return { error: "The file has an unclosed quoted field." };

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Blank lines (e.g. a trailing newline) aren't rows.
  return { rows: rows.filter((r) => r.some((cell) => cell.trim() !== "")) };
}

// Undo the exporter's spreadsheet-formula guard ('=..., '+..., etc.).
function unguardText(value) {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

// Strict YYYY-MM-DD (the export format), checked to be a real calendar date
// and built with the local constructor like cityService.dbDateToLocalDate.
function parseVisitDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// Same city + country + visit date = the same visit.
export function cityDuplicateKey(city) {
  return [
    city.cityName.trim().toLowerCase(),
    (city.countryCode || "").toUpperCase(),
    toDateKey(new Date(city.date)),
  ].join("|");
}

function parseCoordinate(value, min, max) {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

// Turns parsed rows into preview entries:
// { row, city, errors: string[], isDuplicate }. `existingCities` are the
// user's own cities, used both for duplicate detection and to fill in a
// missing country code from a matching country name.
export function buildImportPreview(rows, existingCities) {
  if (!rows.length) return { fileError: "The file is empty." };

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length) {
    return {
      fileError: `Missing column(s): ${missingHeaders.join(", ")}. Use a file exported from TravelTrack.`,
    };
  }

  const dataRows = rows.slice(1);
  if (!dataRows.length) return { fileError: "The file has no cities in it." };
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      fileError: `The file has ${dataRows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import.`,
    };
  }

  const codeByCountry = {};
  existingCities.forEach((city) => {
    if (city.country && city.countryCode) {
      codeByCountry[city.country.trim().toLowerCase()] = city.countryCode;
    }
  });

  const seenKeys = new Set(existingCities.map(cityDuplicateKey));

  const entries = dataRows.map((cells, index) => {
    const record = {};
    headers.forEach((header, column) => {
      const field = HEADER_TO_FIELD[header];
      if (field) record[field] = (cells[column] ?? "").trim();
    });

    const errors = [];
    const cityName = unguardText(record.cityName || "");
    const country = unguardText(record.country || "");
    const notes = unguardText(record.notes || "");
    const countryCode = (
      record.countryCode || codeByCountry[country.toLowerCase()] || ""
    ).toUpperCase();
    const date = parseVisitDate(record.date || "");
    const lat = parseCoordinate(record.lat || "", -90, 90);
    const lng = parseCoordinate(record.lng || "", -180, 180);

    if (!cityName) errors.push("City is required");
    if (!country) errors.push("Country is required");
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      errors.push(
        record.countryCode
          ? "Country code must be 2 letters"
          : "Country code is missing",
      );
    }
    if (!date) errors.push("Visit date must be a valid YYYY-MM-DD date");
    if (lat === null) errors.push("Latitude must be between -90 and 90");
    if (lng === null) errors.push("Longitude must be between -180 and 180");

    const city = {
      cityName,
      country,
      countryCode,
      date,
      notes,
      region: null,
      position: { lat, lng },
    };

    let isDuplicate = false;
    if (!errors.length) {
      const key = cityDuplicateKey(city);
      isDuplicate = seenKeys.has(key);
      seenKeys.add(key);
    }

    // 1-based data row (not a file line - quoted notes can span lines).
    return { row: index + 1, city, errors, isDuplicate };
  });

  return { entries };
}
