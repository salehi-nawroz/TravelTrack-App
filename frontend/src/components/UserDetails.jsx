import FlagBox from "./FlagBox";
import Button from "./Button";
import Dialog from "./Dialog";
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
// onDelete is passed only when the viewer may delete this account; the
// caller asks for confirmation and does the deleting.
function UserDetails({
  user,
  avatarUrl,
  isLoadingAvatar,
  roleLabel,
  cityCount,
  cities,
  onClose,
  onDelete,
}) {
  // The shared Dialog shell handles Escape, overlay click, the × button,
  // focus and the portal.
  return (
    <Dialog
      labelledBy="user-details-title"
      onClose={onClose}
      size="md"
      showCloseButton
    >
      <div className={styles.header}>
        <img
          src={
            !isLoadingAvatar && avatarUrl ? avatarUrl : "/default-avatar.svg"
          }
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
        {onDelete && (
          <Button variant="danger" htmlType="button" onClick={onDelete}>
            Delete account
          </Button>
        )}
        <Button variant="secondary" htmlType="button" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

export default UserDetails;
