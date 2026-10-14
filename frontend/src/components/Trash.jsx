import { useEffect, useState } from "react";

import styles from "./Trash.module.css";
import Spinner from "./Spinner";
import EmptyState from "./EmptyState";
import FlagBox from "./FlagBox";
import BackButton from "./BackButton";
import ConfirmDialog from "./ConfirmDialog";
import PageHeader from "./PageHeader";
import { FormMessage } from "./Field";
import { useCities } from "../contexts/CitiesContext";
import Button from "./Button";
import Card from "./Card";
import {
  getMyTrashedCities,
  deleteTrashedCity,
} from "../services/cityService";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));

// The signed-in user's soft-deleted cities (deleted_at set). Restore puts a
// city back via CitiesContext so the list/map update; Delete forever is the
// only permanent delete and always asks first.
function Trash() {
  const { restoreCity } = useCities();

  const [trashedCities, setTrashedCities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // A failed load (replaces the list) vs. a failed restore/delete (shown
  // above the list, which stays usable).
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  // Bumped by "Try again" to repeat the (read-only) load.
  const [reloadKey, setReloadKey] = useState(0);
  // { id, action: "restore" | "delete" } while a request is running.
  const [busy, setBusy] = useState(null);
  const [cityPendingDelete, setCityPendingDelete] = useState(null);

  useEffect(() => {
    let isMounted = true;

    setIsLoading(true);
    setLoadError("");

    getMyTrashedCities()
      .then((data) => {
        if (isMounted) setTrashedCities(data);
      })
      .catch((err) => {
        console.error("Failed to load trash:", err.message);
        if (isMounted) setLoadError("Please check your connection and try again.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [reloadKey]);

  function removeFromList(id) {
    setTrashedCities((current) => current.filter((city) => city.id !== id));
  }

  async function handleRestore(city) {
    setBusy({ id: city.id, action: "restore" });
    setActionError("");
    try {
      await restoreCity(city.id);
      removeFromList(city.id);
    } catch (err) {
      console.error("Failed to restore city:", err.message);
      setActionError(`Could not restore ${city.cityName}. Please try again.`);
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirmDelete() {
    const city = cityPendingDelete;
    setCityPendingDelete(null);
    setBusy({ id: city.id, action: "delete" });
    setActionError("");
    try {
      await deleteTrashedCity(city.id);
      removeFromList(city.id);
    } catch (err) {
      console.error("Failed to permanently delete city:", err.message);
      setActionError(`Could not delete ${city.cityName}: ${err.message}`);
    } finally {
      setBusy(null);
    }
  }

  const header = (
    <PageHeader
      title="Trash"
      summary={
        !isLoading && !loadError && trashedCities.length
          ? `${trashedCities.length} ${
              trashedCities.length === 1 ? "city" : "cities"
            }`
          : null
      }
      note="Restore a city to put it back on your map, or delete it for good."
      actions={<BackButton />}
    />
  );

  function renderContent() {
    if (isLoading) return <Spinner label="Loading trash…" />;

    if (loadError) {
      return (
        <EmptyState
          tone="error"
          title="Couldn't load the Trash"
          message={loadError}
          action={
            <Button
              variant="outline"
              size="sm"
              htmlType="button"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </Button>
          }
        />
      );
    }

    if (!trashedCities.length) {
      return (
        <EmptyState
          icon="trash"
          title="The Trash is empty"
          message="Cities you delete stay here until you restore them or delete them for good."
        />
      );
    }

    return (
      <ul className={styles.list}>
        {trashedCities.map((city) => {
          const isBusy = busy?.id === city.id;

          return (
            <Card as="li" key={city.id} className={styles.item}>
              <FlagBox
                countryCode={city.countryCode}
                country={city.country}
                position="left"
              />
              <div className={styles.info}>
                <h3>{city.cityName}</h3>
                <p>
                  Deleted{" "}
                  <time dateTime={city.deletedAt}>
                    {formatDate(city.deletedAt)}
                  </time>
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={() => handleRestore(city)}
                  disabled={isBusy}
                >
                  {isBusy && busy.action === "restore"
                    ? "Restoring…"
                    : "Restore"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  className={styles.danger}
                  onClick={() => setCityPendingDelete(city)}
                  disabled={isBusy}
                >
                  {isBusy && busy.action === "delete"
                    ? "Deleting…"
                    : "Delete forever"}
                </Button>
              </div>
            </Card>
          );
        })}
      </ul>
    );
  }

  return (
    <div className={styles.trash}>
      {header}

      {actionError && <FormMessage>{actionError}</FormMessage>}

      {renderContent()}

      {cityPendingDelete && (
        <ConfirmDialog
          title="Delete forever?"
          message={
            <>
              Permanently delete <strong>{cityPendingDelete.cityName}</strong>?
            </>
          }
          confirmLabel="Delete forever"
          onConfirm={handleConfirmDelete}
          onCancel={() => setCityPendingDelete(null)}
        />
      )}
    </div>
  );
}

export default Trash;
