import { describe, expect, it } from "vitest";
import { citiesToCsv } from "./exportCitiesCsv";
import {
  MAX_IMPORT_ROWS,
  buildImportPreview,
  cityDuplicateKey,
  parseCsv,
} from "./importCitiesCsv";

const lisbon = {
  cityName: "Lisbon",
  country: "Portugal",
  countryCode: "PT",
  date: new Date(2025, 4, 2),
  notes: 'Tram 28, "pastéis", and\na second line',
  position: { lat: 38.72, lng: -9.14 },
};

const preview = (csv, existing = []) => buildImportPreview(parseCsv(csv).rows, existing);

describe("CSV export", () => {
  it("writes the importer's headers and quotes commas, quotes and line breaks", () => {
    const [header, ...rest] = citiesToCsv([lisbon]).split("\r\n");
    expect(header).toBe("City,Country,Country code,Visit date,Notes,Latitude,Longitude");
    expect(rest.join("\r\n")).toBe(
      'Lisbon,Portugal,PT,2025-05-02,"Tram 28, ""pastéis"", and\na second line",38.72,-9.14',
    );
  });

  it("neutralises spreadsheet formulas in text, but not in numbers", () => {
    const csv = citiesToCsv([{ ...lisbon, cityName: "=HYPERLINK(1)", notes: "+1", position: { lat: -5, lng: 7 } }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain("'+1");
    expect(csv.endsWith(",-5,7")).toBe(true);
  });
});

describe("CSV import", () => {
  it("round-trips an export exactly", () => {
    const { entries } = preview("﻿" + citiesToCsv([lisbon, { ...lisbon, cityName: "=SUM(A1)", notes: "" }]));
    expect(entries.map((e) => e.errors)).toEqual([[], []]);
    expect(entries[0].city).toMatchObject({ cityName: "Lisbon", countryCode: "PT", notes: lisbon.notes, position: { lat: 38.72, lng: -9.14 } });
    expect(entries[0].city.date.getTime()).toBe(lisbon.date.getTime());
    expect(entries[1].city.cityName).toBe("=SUM(A1)");
  });

  it("rejects an unclosed quote, missing columns, empty files and oversized files", () => {
    expect(parseCsv('City\n"Lisbon').error).toMatch(/unclosed/);
    expect(preview("City,Country\nLisbon,Portugal").fileError).toMatch(/visit date, latitude, longitude/);
    expect(preview("").fileError).toMatch(/empty/);
    expect(preview("City,Country,Visit date,Latitude,Longitude\n").fileError).toMatch(/no cities/);
    const big = "City,Country,Country code,Visit date,Latitude,Longitude\n" + "A,B,PT,2025-01-01,1,1\n".repeat(MAX_IMPORT_ROWS + 1);
    expect(preview(big).fileError).toMatch(/limit/);
  });

  it("explains every invalid field on the row it belongs to", () => {
    const { entries } = preview(
      "City,Country,Country code,Visit date,Latitude,Longitude\n,,P,2025-02-30,91,abc",
    );
    expect(entries[0].row).toBe(1);
    expect(entries[0].errors).toEqual([
      "City is required",
      "Country is required",
      "Country code must be 2 letters",
      "Visit date must be a valid YYYY-MM-DD date",
      "Latitude must be between -90 and 90",
      "Longitude must be between -180 and 180",
    ]);
  });

  it("ignores extra columns such as an owner id, so a file can't choose the owner", () => {
    const { entries } = preview(
      "user_id,City,Country,Country code,Visit date,Latitude,Longitude\nsomeone-else,Porto,Portugal,PT,2025-05-05,41.15,-8.61",
    );
    expect(entries[0].errors).toEqual([]);
    expect(Object.keys(entries[0].city)).not.toContain("userId");
    expect(Object.keys(entries[0].city)).not.toContain("user_id");
  });

  it("fills a missing country code from the user's cities and flags duplicates", () => {
    const { entries } = preview(
      "City,Country,Visit date,Latitude,Longitude\nlisbon,Portugal,2025-05-02,38.72,-9.14\nPorto,Portugal,2025-05-05,41.15,-8.61\nPorto,Portugal,2025-05-05,41.15,-8.61",
      [lisbon],
    );
    expect(entries.map((e) => e.city.countryCode)).toEqual(["PT", "PT", "PT"]);
    expect(entries.map((e) => e.isDuplicate)).toEqual([true, false, true]);
    expect(cityDuplicateKey(entries[0].city)).toBe(cityDuplicateKey(lisbon));
  });
});
