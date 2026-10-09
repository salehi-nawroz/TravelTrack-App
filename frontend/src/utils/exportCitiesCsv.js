const COLUMNS = [
  { header: "City", value: (city) => city.cityName, isText: true },
  { header: "Country", value: (city) => city.country, isText: true },
  // Needed by the importer: cities.country_code is required.
  { header: "Country code", value: (city) => city.countryCode, isText: true },
  { header: "Visit date", value: (city) => formatLocalDate(city.date) },
  { header: "Notes", value: (city) => city.notes, isText: true },
  { header: "Latitude", value: (city) => city.position?.lat },
  { header: "Longitude", value: (city) => city.position?.lng },
];

// Local getters only (never toISOString), for the same reason as
// cityService.localDateToDbDate: avoid shifting the date through UTC.
function formatLocalDate(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return "";
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// RFC 4180 quoting: wrap in quotes when the value has a comma, quote or line
// break, and double any quotes inside. User-entered text that starts with a
// formula character is prefixed with ' so spreadsheet apps don't run it.
function toCsvCell(rawValue, isText) {
  if (rawValue === null || rawValue === undefined) return "";

  let value = String(rawValue);
  if (isText && /^[=+\-@\t\r]/.test(value)) value = `'${value}`;

  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function citiesToCsv(cities) {
  const header = COLUMNS.map((column) => toCsvCell(column.header)).join(",");
  const rows = cities.map((city) =>
    COLUMNS.map((column) => toCsvCell(column.value(city), column.isText)).join(
      ",",
    ),
  );
  return [header, ...rows].join("\r\n");
}

// Builds the file in the browser and triggers a download - nothing is sent
// anywhere. The BOM makes Excel read accented city names as UTF-8.
export function downloadCitiesCsv(cities) {
  const csv = citiesToCsv(cities);
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `traveltrack-cities-${formatLocalDate(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
