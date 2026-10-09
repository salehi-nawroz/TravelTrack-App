import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Button from "./Button";
import styles from "./CityImport.module.css";
import { useCities } from "../contexts/CitiesContext";
import {
  MAX_IMPORT_FILE_BYTES,
  buildImportPreview,
  parseCsv,
} from "../utils/importCitiesCsv";

const formatDate = (date) =>
  date
    ? new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : "-";

// "Import CSV" button + hidden file picker + preview dialog. Nothing is
// written until the user confirms in the preview, and only valid,
// non-duplicate rows are sent.
function CityImport({ buttonClassName, onDialogOpenChange }) {
  const { cities, importCities } = useCities();
  const fileInputRef = useRef(null);

  const [preview, setPreview] = useState(null); // { fileName, entries?, fileError? }
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState(null); // { imported, failed, skipped }

  const entries = preview?.entries ?? [];
  const readyEntries = entries.filter((e) => !e.errors.length && !e.isDuplicate);
  const duplicateCount = entries.filter((e) => e.isDuplicate).length;
  const invalidCount = entries.filter((e) => e.errors.length).length;

  function handleClose() {
    if (isImporting) return;
    setPreview(null);
    setResult(null);
  }

  const isDialogOpen = Boolean(preview);
  useEffect(() => {
    onDialogOpenChange?.(isDialogOpen);
  }, [isDialogOpen, onDialogOpenChange]);

  useEffect(() => {
    if (!preview) return;

    function handleKeyDown(e) {
      if (e.key === "Escape" && !isImporting) {
        setPreview(null);
        setResult(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [preview, isImporting]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;

    setResult(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setPreview({ fileName: file.name, fileError: "Please choose a .csv file." });
      return;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setPreview({ fileName: file.name, fileError: "The file must be smaller than 1MB." });
      return;
    }

    try {
      const parsed = parseCsv(await file.text());
      if (parsed.error) {
        setPreview({ fileName: file.name, fileError: parsed.error });
        return;
      }
      setPreview({ fileName: file.name, ...buildImportPreview(parsed.rows, cities) });
    } catch (err) {
      console.error("Failed to read CSV:", err.message);
      setPreview({ fileName: file.name, fileError: "Could not read this file." });
    }
  }

  async function handleImport() {
    if (!readyEntries.length || isImporting) return;

    setIsImporting(true);
    try {
      const { imported, failed } = await importCities(
        readyEntries.map((entry) => entry.city),
      );
      setResult({
        imported,
        failed,
        skipped: duplicateCount + invalidCount,
      });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        onClick={() => fileInputRef.current?.click()}
      >
        Import CSV
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className={styles.fileInput}
        onChange={handleFileChange}
      />

      {/* Portaled to <body>: the button lives inside the sticky toolbar,
          whose z-index creates a stacking context that would otherwise cap
          the overlay below the map and other UI. */}
      {preview &&
        createPortal(
          <div className={styles.overlay} onClick={handleClose}>
            <div
              className={styles.dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="city-import-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="city-import-title">Import cities</h2>
              <p className={styles.fileName}>{preview.fileName}</p>

              {preview.fileError ? (
                <p className={styles.error}>{preview.fileError}</p>
              ) : result ? (
                <div className={styles.result}>
                  <p>
                    Imported <strong>{result.imported}</strong>{" "}
                    {result.imported === 1 ? "city" : "cities"}.
                  </p>
                  {result.failed > 0 && (
                    <p className={styles.error}>
                      {result.failed} could not be saved. Please try again later.
                    </p>
                  )}
                  {result.skipped > 0 && (
                    <p>{result.skipped} skipped (duplicates or invalid rows).</p>
                  )}
                </div>
              ) : (
                <>
                  <p className={styles.summary}>
                    <span className={styles.ready}>{readyEntries.length} ready</span>
                    {" · "}
                    <span>{duplicateCount} already in your cities</span>
                    {" · "}
                    <span className={invalidCount ? styles.invalid : ""}>
                      {invalidCount} with errors
                    </span>
                  </p>

                  <ul className={styles.rows}>
                    {entries.map((entry) => (
                      <li
                        key={entry.row}
                        className={
                          entry.errors.length
                            ? styles.rowInvalid
                            : entry.isDuplicate
                              ? styles.rowDuplicate
                              : styles.rowReady
                        }
                      >
                        <span className={styles.rowNumber}>#{entry.row}</span>
                        <span className={styles.rowCity}>
                          {entry.city.cityName || "(no city)"}
                          {entry.city.country && `, ${entry.city.country}`}
                        </span>
                        <span className={styles.rowDate}>
                          {formatDate(entry.city.date)}
                        </span>
                        <span className={styles.rowStatus}>
                          {entry.errors.length
                            ? entry.errors.join("; ")
                            : entry.isDuplicate
                              ? "Duplicate - skipped"
                              : "Ready"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className={styles.actions}>
                <Button type="back" onClick={handleClose} disabled={isImporting}>
                  {result || preview.fileError ? "Close" : "Cancel"}
                </Button>

                {!result && !preview.fileError && (
                  <Button
                    type="primary"
                    onClick={handleImport}
                    disabled={!readyEntries.length || isImporting}
                  >
                    {isImporting
                      ? "Importing..."
                      : `Import ${readyEntries.length} ${
                          readyEntries.length === 1 ? "city" : "cities"
                        }`}
                  </Button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export default CityImport;
