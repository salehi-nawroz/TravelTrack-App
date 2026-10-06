import { useEffect } from "react";
import FlagBox from "./FlagBox";
import Button from "./Button";
import styles from "./UserDetails.module.css";

const formatDate = (date) =>
  date
    ? new Intl.DateTimeFormat("en", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(date))
    : "Unknown";

// Purely presentational, same shape as ConfirmDialog: the caller resolves
// the avatar URl and filters the user's cities beforehand (both already
// available from data AdminUsers already has - no request is made here).
function UserDetails({
  user,
  avatarUrl,
  isLoadingAvatar,
  roleLabel,
  cityCount,
  cities,
  onClose,
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-details-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        <div className={styles.header}>
          <img
            src={!isLoadingAvatar && avatarUrl ? avatarUrl : "/user.png"}
            alt=""
            className={styles.avatar}
          />
          <div>
            <h2 id="user-details-title">{user.fullName || "(no name)"}</h2>
            <p className={styles.email}>{user.email}</p>
          </div>
        </div>

        <dl className={styles.detailsList}>
          <div className={styles.detailRow}>
            <dt>Role</dt>
            <dd>{roleLabel}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Joined</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>Cities</dt>
            <dd>
              {cityCount} {cityCount === 1 ? "city" : "cities"}
            </dd>
          </div>
        </dl>

        <h3 className={styles.citiesTitle}>Cities</h3>

        {cities.length ? (
          <ul className={styles.citiesList}>
            {cities.map((city) => (
              <li key={city.id} className={styles.cityRow}>
                <FlagBox
                  countryCode={city.countryCode}
                  country={city.country}
                  position="left"
                />
                <span className={styles.cityName}>{city.cityName}</span>
                <span className={styles.cityCountry}>{city.country}</span>
                <time className={styles.cityDate}>{formatDate(city.date)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.noCities}>No cities yet.</p>
        )}

        <div className={styles.actions}>
          <Button type="back" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default UserDetails;
