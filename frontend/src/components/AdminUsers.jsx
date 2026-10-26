import { useEffect, useMemo, useRef, useState } from "react";
import adminStyles from "../pages/Admin.module.css";
import styles from "./AdminUsers.module.css";
import Spinner from "./Spinner";
import EmptyState from "./EmptyState";
import Pagination from "./Pagination";
import UserDetails from "./UserDetails";
import { usePagination } from "../hooks/usePagination";
import { compareDates } from "../utils/compareDates";
import Button from "./Button";
import Card from "./Card";
import Field, { FormMessage } from "./Field";
import CollapsibleFilters from "./CollapsibleFilters";
import ConfirmDialog from "./ConfirmDialog";
import { adminDeleteUser } from "../services/accountService";
import { canDeleteUser } from "../utils/userPermissions";
import {
  getAvatarSignedUrl,
  getAvatarSignedUrls,
} from "../services/avatarService";

const USERS_PAGE_SIZE = 10;

const ROLE_LABELS = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

const SORT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "nameAsc", label: "Name A-Z" },
  { value: "nameDesc", label: "Name Z-A" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "mostCities", label: "Most cities" },
  { value: "fewestCities", label: "Fewest cities" },
];

const displayName = (user) => user.fullName || user.email || "this user";

// `users` comes from profileService.getAdminUsers() (loaded by Admin.jsx);
// `cities` is the same already-loaded array the Cities tab uses - reused
// here only to derive a per-user city count/list, never refetched.
// onUserDeleted(id) runs only after the server confirmed the deletion.
function AdminUsers({
  users,
  isLoadingUsers,
  usersError,
  onRetry,
  cities,
  viewer,
  onUserDeleted,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [sortOption, setSortOption] = useState("default");

  const [selectedUser, setSelectedUser] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [isLoadingAvatar, setIsLoadingAvatar] = useState(false);
  // Tracks whose avatar is currently being requested, so a response that
  // arrives after the admin has already selected a different user (or
  // closed the modal) can be told apart from the one that's still current.
  const selectedUserIdRef = useRef(null);
  // avatarPath -> signed URL for the rows on the current page only.
  const [thumbUrlByPath, setThumbUrlByPath] = useState({});

  const [pendingDeleteUser, setPendingDeleteUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");

  const activeControlCount = [
    searchQuery.trim(),
    roleFilter,
    sortOption !== "default",
  ].filter(Boolean).length;
  const hasActiveControls = activeControlCount > 0;

  const nameOptions = useMemo(
    () =>
      [...new Set(users.map((user) => user.fullName).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [users],
  );

  // userId -> city count, derived once from the already-loaded `cities`
  // array. No per-user request - this is exactly the N+1 pattern to avoid.
  const cityCountByUserId = useMemo(
    () =>
      cities.reduce((acc, city) => {
        acc[city.userId] = (acc[city.userId] ?? 0) + 1;
        return acc;
      }, {}),
    [cities],
  );

  // Pipeline: raw users -> search (name + email) -> role filter -> sort.
  // Pagination below then slices this derived array, never the raw `users`
  // prop.
  const processedUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let result = users.filter((user) => {
      if (!query) return true;
      return (
        (user.fullName || "").toLowerCase().includes(query) ||
        (user.email || "").toLowerCase().includes(query)
      );
    });

    if (roleFilter) {
      result = result.filter((user) => user.role === roleFilter);
    }

    return [...result].sort((a, b) => {
      switch (sortOption) {
        case "nameAsc":
          return (a.fullName || "").localeCompare(b.fullName || "");
        case "nameDesc":
          return (b.fullName || "").localeCompare(a.fullName || "");
        case "newest":
          return (
            compareDates(b.createdAt, a.createdAt) ||
            (a.fullName || "").localeCompare(b.fullName || "")
          );
        case "oldest":
          return (
            compareDates(a.createdAt, b.createdAt) ||
            (a.fullName || "").localeCompare(b.fullName || "")
          );
        case "mostCities":
          return (
            (cityCountByUserId[b.id] ?? 0) - (cityCountByUserId[a.id] ?? 0) ||
            (a.fullName || "").localeCompare(b.fullName || "")
          );
        case "fewestCities":
          return (
            (cityCountByUserId[a.id] ?? 0) - (cityCountByUserId[b.id] ?? 0) ||
            (a.fullName || "").localeCompare(b.fullName || "")
          );
        default:
          return 0;
      }
    });
  }, [users, searchQuery, roleFilter, sortOption, cityCountByUserId]);

  const { currentPage, totalPages, startIndex, endIndex, goToPage, resetPage } =
    usePagination(processedUsers.length, USERS_PAGE_SIZE);

  useEffect(() => {
    resetPage();
  }, [searchQuery, roleFilter, sortOption, resetPage]);

  function handleClearFilters() {
    setSearchQuery("");
    setRoleFilter("");
    setSortOption("default");
  }

  async function handleSelectUser(user) {
    setSelectedUser(user);
    setAvatarUrl(null);
    selectedUserIdRef.current = user.id;

    if (!user.avatarPath) return;

    setIsLoadingAvatar(true);
    try {
      const url = await getAvatarSignedUrl(user.avatarPath);
      if (selectedUserIdRef.current === user.id) {
        setAvatarUrl(url);
      }
    } catch (err) {
      console.error("Failed to load avatar:", err.message);
    } finally {
      if (selectedUserIdRef.current === user.id) {
        setIsLoadingAvatar(false);
      }
    }
  }

  function handleCloseDetails() {
    setSelectedUser(null);
    setAvatarUrl(null);
    selectedUserIdRef.current = null;
  }

  function handleRequestDelete(user) {
    handleCloseDetails();
    setPendingDeleteUser(user);
  }

  async function handleConfirmDelete() {
    const user = pendingDeleteUser;
    setPendingDeleteUser(null);
    setDeleteError("");
    setDeleteNotice("");
    setDeletingUser(user);
    try {
      const { warnings } = await adminDeleteUser(user.id);
      onUserDeleted(user.id);
      setDeleteNotice([`Deleted ${displayName(user)}'s account.`, ...warnings].join(" "));
    } catch (err) {
      setDeleteError(`Couldn't delete ${displayName(user)}'s account. ${err.message}`);
    } finally {
      setDeletingUser(null);
    }
  }

  const paginatedUsers = processedUsers.slice(startIndex, endIndex);

  // Sign only the visible page's avatars, in a single request. The joined
  // string keeps the effect from re-running on every render, since
  // `paginatedUsers` is a new array each time.
  const pageAvatarPathsKey = paginatedUsers
    .map((user) => user.avatarPath)
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    setThumbUrlByPath({});
    if (!pageAvatarPathsKey) return;

    let isCurrent = true;
    getAvatarSignedUrls(pageAvatarPathsKey.split("|"))
      .then((urls) => {
        if (isCurrent) setThumbUrlByPath(urls);
      })
      .catch((err) => console.error("Failed to load avatars:", err.message));

    return () => {
      isCurrent = false;
    };
  }, [pageAvatarPathsKey]);

  return (
    <Card
      as="section"
      className={adminStyles.section}
      id="admin-panel-users"
      role="tabpanel"
      aria-labelledby="admin-tab-users"
    >
      <h3 className={adminStyles.sectionTitle}>
        Users
        {!isLoadingUsers && !usersError && (
          <span className={adminStyles.count}>({users.length})</span>
        )}
      </h3>

      {deletingUser && (
        <Spinner label={`Deleting ${displayName(deletingUser)}'s account…`} />
      )}
      {deleteError && <FormMessage>{deleteError}</FormMessage>}
      {deleteNotice && (
        <p className={styles.notice} role="status">
          {deleteNotice}
        </p>
      )}

      {isLoadingUsers ? (
        <Spinner label="Loading users…" />
      ) : usersError ? (
        <EmptyState
          tone="error"
          title="Couldn't load users"
          message={usersError}
          action={
            <Button
              variant="outline"
              size="sm"
              htmlType="button"
              onClick={onRetry}
            >
              Try again
            </Button>
          }
        />
      ) : !users.length ? (
        <EmptyState icon="profile" title="No users found" />
      ) : (
        <>
          <div className={`${adminStyles.toolbar} ${adminStyles.userToolbar}`}>
            <CollapsibleFilters activeCount={activeControlCount} toggleable>
              <Field variant="toolbar" id="adminUserSearch" label="Search">
                <input
                  id="adminUserSearch"
                  type="text"
                  className={adminStyles.toolbarCombo}
                  placeholder="Search by name or email..."
                  list="adminUserNames"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <datalist id="adminUserNames">
                  {nameOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>

              <Field variant="toolbar" id="adminRoleFilter" label="Role">
                <select
                  id="adminRoleFilter"
                  className={adminStyles.toolbarCombo}
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">All Roles</option>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field variant="toolbar" id="adminUserSort" label="Sort">
                <select
                  id="adminUserSort"
                  className={adminStyles.toolbarCombo}
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </CollapsibleFilters>

            <div className={adminStyles.toolbarResult}>
              <span className={adminStyles.toolbarCount}>
                {hasActiveControls
                  ? `${processedUsers.length} of ${users.length} users`
                  : `${users.length} users`}
              </span>

              {hasActiveControls && (
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={handleClearFilters}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {!processedUsers.length ? (
            <EmptyState
              compact
              icon="profile"
              title="No users match your filters."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  htmlType="button"
                  onClick={handleClearFilters}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ul className={styles.list}>
              <li className={styles.listHeaderRow}>
                <span className={styles.avatarCell} aria-hidden="true" />
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Cities</span>
              </li>
              {paginatedUsers.map((user) => {
                const cityCount = cityCountByUserId[user.id] ?? 0;

                return (
                  <li key={user.id} className={styles.listRow}>
                    <button
                      type="button"
                      className={styles.rowButton}
                      onClick={() => handleSelectUser(user)}
                    >
                      <img
                        src={thumbUrlByPath[user.avatarPath] || "/default-avatar.svg"}
                        alt=""
                        className={styles.avatarThumb}
                      />
                      <span className={styles.name}>
                        {user.fullName || "(no name)"}
                      </span>
                      <span className={styles.email}>{user.email}</span>
                      <span
                        className={`${adminStyles.role} ${
                          adminStyles[`role-${user.role}`] || ""
                        }`}
                      >
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                      <span className={styles.cityCount}>
                        {cityCount} {cityCount === 1 ? "city" : "cities"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className={adminStyles.paginationWrapper}>
              <p className={adminStyles.pageInfo}>
                Page {currentPage} of {totalPages}
              </p>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={processedUsers.length}
                onPageChange={goToPage}
              />
            </div>
          )}
        </>
      )}

      {selectedUser && (
        <UserDetails
          user={selectedUser}
          avatarUrl={avatarUrl}
          isLoadingAvatar={isLoadingAvatar}
          roleLabel={ROLE_LABELS[selectedUser.role] || selectedUser.role}
          cityCount={cityCountByUserId[selectedUser.id] ?? 0}
          cities={cities.filter((city) => city.userId === selectedUser.id)}
          onClose={handleCloseDetails}
          onDelete={
            canDeleteUser(selectedUser, viewer) && !deletingUser
              ? () => handleRequestDelete(selectedUser)
              : undefined
          }
        />
      )}

      {pendingDeleteUser && (
        <ConfirmDialog
          title="Delete account?"
          message={
            <>
              Permanently delete <strong>{displayName(pendingDeleteUser)}</strong>
              {pendingDeleteUser.email && ` (${pendingDeleteUser.email})`}? Their
              sign-in, profile, cities, trips and trip photos are all deleted.
            </>
          }
          warning="This can't be undone."
          confirmLabel="Delete account"
          onConfirm={handleConfirmDelete}
          onCancel={() => setPendingDeleteUser(null)}
        />
      )}
    </Card>
  );
}

export default AdminUsers;
