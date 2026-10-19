# TravelTrack

TravelTrack is a travel journal on a map. Pin the cities you've visited, group them by country and continent, record trips with an ordered itinerary and photos, and see your travel statistics, all on an interactive Leaflet map.

The public **Explore** page shows a read-only demo with sample data, so you can try it without an account.

## Features

- **Cities:** add a city by clicking the map, searching for a place or using your current location. The name and country are filled in by reverse geocoding. You can add a visit date and notes, and edit or delete cities.
- **Trash:** deleted cities go to the Trash first. From there you can restore them or delete them permanently.
- **Countries:** your cities grouped by country and continent.
- **Trips** (behind the `VITE_TRIPS_ENABLED` flag):
  - start a trip, with only one active trip at a time;
  - add destinations from your cities or as new places, and reorder them;
  - end a trip;
  - upload photos (JPEG, PNG or WEBP, up to 5 MB) and choose a cover photo.
  - The open trip's numbered stops and route are drawn on the map.
- **Statistics:** totals, visits per year, your longest trip and a map of the countries you have visited.
- **Search and data:** global search across cities, countries, continents and (for admins) users, and CSV export and import. Import shows a preview with per-row validation and duplicate detection.
- **Profile:**
  - display name and avatar (stored in a private bucket);
  - change password;
  - delete account, which also removes the account's trip photo files.
- **Roles:**
  - `user` sees only their own data;
  - `admin` can view and edit other users' data, except super admins' data;
  - `super_admin` can do everything.
- **Responsive layout:** a resizable side panel on desktop and tablet. On phones there's a bottom sheet, a bottom navigation bar and 44 px touch targets.

## Technology

| Area | Used |
| --- | --- |
| UI | React 18, React Router 6, CSS Modules |
| Build | Vite 4 |
| Maps | Leaflet with react-leaflet. Tiles: OpenStreetMap. Place search: Nominatim. Reverse geocoding: BigDataCloud. Flags: flagcdn. |
| Backend | Supabase: Postgres with Row Level Security, Auth (email and password), private Storage buckets |
| Tests | Vitest, React Testing Library, jsdom |
| Hosting | Vercel (static SPA) with GitHub Actions CI |

There is no custom server. The browser talks to Supabase directly, and Row Level Security decides what each user can read or change.

## Getting started

Requirements: Node.js 20 or newer (CI uses Node 22), and a Supabase project.

```bash
cd frontend
cp .env.example .env.local   # then fill in the values (see below)
npm ci
npm run dev                  # http://localhost:5173
```

### Environment variables

These are set in `frontend/.env.local` for local development and in the Vercel project settings for production.

| Variable | Required | Value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Project URL, from Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | yes | The **anon / publishable** key from the same page |
| `VITE_TRIPS_ENABLED` | no | `true` turns on trip tracking. Only set it after the trip scripts below have been applied. |

Every `VITE_*` value is compiled into the public JavaScript. **Never** put the `service_role` / secret key there.

The app checks its configuration at startup:
- if a value is missing or malformed, it shows a setup message instead of a blank page;
- if a secret key has been placed in `VITE_SUPABASE_ANON_KEY`, it refuses to start.

The service-role key is only used by the one-off admin scripts in `scripts/`. They read it from `scripts/.env` (git-ignored; see `scripts/.env.example`).

## Database setup (Supabase)

The SQL lives in `scripts/`. Run each file in the Supabase Dashboard → SQL Editor, in this order, for a **new** project. The existing live project already has all of it.

1. `base-schema.sql`: the `profiles` and `cities` tables, owner-only RLS policies, and the trigger that creates a profile for each new user.
2. `add-admin-roles.sql`: the `role` column (`user` / `admin` / `super_admin`), the `current_user_role()` helper, the admin policies, and a column-level UPDATE grant so users can't change their own role.
3. `restrict-admin-super-admin-access.sql`: admins can't see or edit super admins' profiles or cities.
4. `get-admin-users-function.sql`: the only path from the browser to user emails (admins only).
5. `cities-soft-delete.sql`: adds `deleted_at`, which the Trash uses.
6. `delete-own-account-function.sql`: self-service account deletion.
7. `node --env-file=scripts/.env scripts/setup-avatars-storage.mjs`, then `avatars-storage-policies.sql`: the private `avatars` bucket and its policies.
8. Trip tracking. Follow `scripts/trips-migration-checklist.md`:
   - run `trips-schema.sql`;
   - run `setup-trip-photos-storage.mjs` (the private `trip-photos` bucket: 5 MB, JPEG, PNG and WEBP);
   - run `trip-photos-storage-policies.sql`;
   - then do the read-only checks in `trips-verify.sql`.

   `trips-rollback.sql` undoes this step.

`scripts/recommended-hardening.sql` contains reviewed, optional hardening for the live project (see Security). It has **not** been applied.

### Security model

- **Row Level Security** is enabled on every table:
  - users read and write only their own rows;
  - admins are limited to non-super-admin users, and super admins are unrestricted;
  - writes that RLS blocks return no rows, and the app treats that as a failure.
- **Roles:** users can only update `full_name` and `avatar_path` on their own profile (column-level grant). The signup trigger copies only the display name from sign-up metadata, never a role.
- **Storage:** both buckets are private and are read through short-lived signed URLs. Files sit under a `<user id>/` folder, and the Storage policies check that folder. Size and type limits are enforced by the bucket and re-checked in the browser.
- **Emails:** they live only in `auth.users` and reach the browser only through the admin-only `get_admin_users()` function.
- **Sessions:** stored in `sessionStorage`, so a session lasts until the tab is closed.
  - A signed-out visitor to `/app/...` is sent to `/login` and returned afterwards.
  - The return address is accepted only if it's inside `/app`.
- **HTTP headers:** `frontend/vercel.json` sets a Content-Security-Policy (only the origins the app uses), plus `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy.

## Scripts

From `frontend/`:

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm test` | Unit and component tests (Vitest). Supabase is mocked, so no credentials or network are needed. |
| `npm run lint` | ESLint, with zero warnings allowed |
| `npm run build` | Production build into `frontend/dist` |
| `npm run preview` | Serves the production build locally |

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and on every pull request. It:

- installs from the lockfile (`npm ci`);
- runs lint and the tests;
- audits runtime dependencies (fails on high or critical);
- builds the app with trip tracking off and on.

It uses read-only permissions and no secrets: the build gets placeholder Supabase values. It does not deploy anything.

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repository.
3. Set **Root Directory** to `frontend`. Vercel then reads `frontend/vercel.json`, which sets:
   - the Vite framework, `npm ci` and `npm run build`, with output in `dist`;
   - the SPA fallback, so deep links like `/app/trips/123` survive a refresh;
   - asset caching and the security headers.
4. Under **Settings → Environment Variables**, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and, if wanted, `VITE_TRIPS_ENABLED=true`. Add them for Production, and for Preview if you want working preview deployments.
5. Deploy. After that, Vercel deploys `main` automatically and creates a preview deployment for each pull request. GitHub Actions only verifies the code.

### Supabase settings for production

In Supabase → **Authentication → URL Configuration**:

- **Site URL:** your production URL, e.g. `https://traveltrack.vercel.app`.
- **Redirect URLs:** add `https://<your-domain>/login`, the page the sign-up confirmation email returns to. For preview deployments, also add `https://*-<your-team>.vercel.app/login`. Keep `http://localhost:5173/login` for local development.

Also recommended: Authentication → Settings → enable **leaked password protection**.

The CSP allows Supabase on `*.supabase.co`. If you use a custom Supabase domain, add it to `connect-src` and `img-src` in `vercel.json`.

## Known limitations

- **No password reset:** there's no "forgot password" flow (email and password sign-in only, no OAuth). An admin can't reset passwords from the app either.
- **Free OpenStreetMap services:** map tiles and place search use the free OSM tile server and Nominatim, which have fair-use limits. A high-traffic deployment should switch to a commercial tile or geocoding provider.
- **Dependency advisories:**
  - React Router 6 has two moderate advisories whose fixes are only in v7. One concerns server-side rendering, which this app doesn't use. The other needs an attacker-controlled path passed to `navigate()`; the app only does that with validated `/app` paths.
  - Vite 4 and its build tooling have dev-server advisories that are fixed only in newer major versions. They don't affect the static production build.
- **Browser storage:** sessions end when the tab closes (by design, see `supabaseClient.js`).

## Acknowledgments

Built with React, Supabase and Leaflet. Map data © OpenStreetMap contributors; country shapes from Natural Earth. TravelTrack was developed with AI assistance from [Claude Code](https://claude.com/claude-code), used for parts of the implementation, testing and review.
