import { useEffect, useState } from "react";

import styles from "./Trash.module.css";
import Spinner from "./Spinner";
import EmptyState from "./EmptyState";
import FlagBox from "./FlagBox";
import BackButton from "./BackButton";
import ConfirmDialog from "./ConfirmDialog";
import { useCities } from "../contexts/CitiesContext";
import Button from "./Button";
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
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [cityPendingDelete, setCityPendingDelete] = useState(null);

  useEffect(() => {
    let isMounted = true;

    getMyTrashedCities()
      .then((data) => {
        if (isMounted) setTrashedCities(data);
      })
      .catch((err) => {
        console.error("Failed to load trash:", err.message);
        if (isMounted) setError("Could not load the Trash. Please try again.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function removeFromList(id) {
    setTrashedCities((current) => current.filter((city) => city.id !== id));
  }

  async function handleRestore(city) {
    setBusyId(city.id);
    setError("");
    try {
      await restoreCity(city.id);
      removeFromList(city.id);
    } catch (err) {
      console.error("Failed to restore city:", err.message);
      setError(`Could not restore ${city.cityName}. Please try again.`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    const city = cityPendingDelete;
    setCityPendingDelete(null);
    setBusyId(city.id);
    setError("");
    try {
      await deleteTrashedCity(city.id);
      removeFromList(city.id);
    } catch (err) {
      console.error("Failed to permanently delete city:", err.message);
      setError(`Could not delete ${city.cityName}: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) return <Spinner />;

  return (
    <div className={styles.trash}>
      <div className={styles.header}>
        <h2>Trash</h2>
        <BackButton />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {!trashedCities.length ? (
        <EmptyState
          title="The Trash is empty"
          message="Cities you delete stay here until you restore them or delete them for good."
        />
      ) : (
        <ul className={styles.list}>
          {trashedCities.map((city) => (
            <li key={city.id} className={styles.item}>
              <FlagBox
                countryCode={city.countryCode}
                country={city.country}
                position="left"
              />
              <div className={styles.info}>
                <h3>{city.cityName}</h3>
                <p>Deleted {formatDate(city.deletedAt)}</p>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={() => handleRestore(city)}
                  disabled={busyId === city.id}
                >
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  className={styles.danger}
                  onClick={() => setCityPendingDelete(city)}
                  disabled={busyId === city.id}
                >
                  Delete forever
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

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
