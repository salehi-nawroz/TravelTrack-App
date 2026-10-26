# TravelTrack

TravelTrack is a travel journal on a map. Pin the cities you've visited, group them by country and continent, record trips with an ordered itinerary and photos, and see your travel statistics, all on an interactive Leaflet map.

The public **Explore** page shows a read-only demo with sample data, so you can try it without an account.

## Features

- **Cities:** add a city by clicking the map, searching for a place or using your current location. The name and country are filled in by reverse geocoding. You can add a visit date and notes, and edit or delete cities.
- **Trash:** deleted cities go to the Trash first. From there you can restore them or delete them permanently.
- **Countries:** your cities grouped by country and continent.
- **Trips:**
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
| Maps | Leaflet with react-leaflet. Tiles: OpenStreetMap. Place search: Nominatim. Reverse geocoding: BigDataCloud (`api-bdc.io`; if it is unavailable, the city and country are entered by hand). Flags: flagcdn. |
| Backend | Supabase: Postgres with Row Level Security, Auth (email and password), private Storage buckets |
| Tests | Vitest, React Testing Library, jsdom |
| Hosting | Vercel (static SPA), deployed only by GitHub Actions CI/CD |

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
| `VITE_DEMO_EMAIL` | no | Email of the dedicated public demo account (see [Portfolio demo account](#portfolio-demo-account)) |
| `VITE_DEMO_PASSWORD` | no | Its password. **Intentionally public**: shown on the login page |

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
8. Trip tracking (required: the app always uses the trip tables and the `trip-photos` bucket). Follow `scripts/trips-migration-checklist.md`:
   - run `trips-schema.sql`;
   - run `setup-trip-photos-storage.mjs` (the private `trip-photos` bucket: 5 MB, JPEG, PNG and WEBP);
   - run `trip-photos-storage-policies.sql`;
   - then do the read-only checks in `trips-verify.sql`.

   `trips-rollback.sql` undoes this step.

`scripts/recommended-hardening.sql` contains reviewed, optional hardening for the live project (see Security). It has **not** been applied.

### Portfolio demo account

When `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD` are both set, the login page shows a **Try the Demo Account** panel with the credentials, copy buttons and a **Fill Demo Credentials** button (it fills the form; the visitor still presses Login). When either is unset, the panel is hidden.

Those values end up in the public JavaScript, so they must belong to a **dedicated demo account with the regular `user` role**. Never use an admin, super admin or personal account. A regular user can only see and change their own rows (RLS), so visitors can't reach anyone else's data.

Setting it up:

1. **Create the user.** Supabase → Authentication → Users → **Add user → Create new user**. Use an address you control that is only for the demo (e.g. a plus-address of your own mailbox), a new random password used nowhere else, and tick **Auto Confirm User**. The signup trigger creates its profile with role `user`.
2. **Check the role** (SQL Editor, read-only): `select p.role from public.profiles p join auth.users u on u.id = p.id where u.email = '<demo email>';`. It must be `user`.
3. **Protect it.** Review and run `scripts/demo-account-guard.sql`, then its section 3 with the demo email. Visitors share the password, so without this anyone could change it or delete the account through the API. The Profile page also hides those two forms for the demo account, but that's only the UI.
4. **Add sample data.** Sign in as the demo user and add a few cities and trips (no personal information, no photos of people). Visitors can edit or delete it, so note what you added to restore it later.
5. **Configure the app.** Set `VITE_DEMO_EMAIL` and `VITE_DEMO_PASSWORD` in `frontend/.env.local`, and in Vercel → Settings → Environment Variables (Production, and Preview if wanted). The next deployment shows the panel.

To retire the demo: unset the two variables and redeploy, then remove the account's row from `public.demo_accounts` and delete the user.

An **admin demo** isn't provided, on purpose: the `admin` role can read every non-super-admin user's profile and data, so a public admin login would expose real users. If one is ever needed, use a separate Supabase project with sample data only, never production. A super admin account is never shared.

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

## Continuous integration and deployment

GitHub Actions is the only thing that deploys TravelTrack. `frontend/vercel.json` sets `"git": { "deploymentEnabled": false }`, so pushes no longer make Vercel build anything by itself. Everything runs in `.github/workflows/ci.yml`:

| Job | Runs for | What it does |
| --- | --- | --- |
| `verify` | every push and pull request | `npm ci`, `npm run lint`, `npm test` (JUnit report uploaded as an artifact), `npm audit --omit=dev --audit-level=high`, `npm run build` |
| `stage` | pushes to `main` only, after `verify` passed | checks the commit is still the head of `main`; `vercel pull` + `vercel build --prod` (the project's production settings and env vars); `vercel deploy --prebuilt --prod --skip-domain`, which creates a deployment that **no production domain points at**; waits until it is `READY` and built from this commit; smoke-tests its immutable URL |
| `promote` | after `stage` passed, in the `production` environment | re-checks that the commit is still the head of `main`; `vercel promote <staged URL>` moves the production domains to that exact, tested build (no rebuild); checks that the production domain now serves it, and smoke-tests and compares it with the tested build |

Guarantees and limits:

- A failed, skipped or cancelled `verify` or `stage` means `promote` doesn't run, so production stays on the previous deployment.
- **Pull requests never deploy.** They run `verify` only, and that job has no access to the Vercel secrets. A fork's PR gets no secrets at all. There are no PR preview deployments any more.
- The promoted build is the one that was smoke-tested: same deployment ID, same `index.html`. The CI `verify` build is a separate check build made with placeholder or secret Supabase values.
- **Concurrency:**
  - staging and promotion each run one at a time and are never cancelled midway;
  - a newer pending run replaces an older pending one;
  - an older commit is never promoted after a newer one reaches `main`, because both deploy jobs check the head of `main` first.
- The smoke test checks:
  - the app shell, JS and CSS are served;
  - deep links work through the SPA rewrite;
  - the static data files are served;
  - the CSP and security headers from `vercel.json` are present;
  - the bundle points at a real Supabase project, not a placeholder.

  It doesn't sign in or use Supabase, so it can't prove every feature works.
- **Promotion is an alias switch on Vercel.** Production moves from the old deployment to the new one in one step. If a check fails after the switch, production stays on the new build until you roll back: run `vercel rollback <previous deployment URL>` or use **Instant Rollback** in the dashboard. A rollback stops automatic domain assignment until the next `vercel promote`; this pipeline always promotes explicitly. The job summary repeats these steps.

### One-time setup

None of this can be set from the repository. Until it's done, the `stage` job fails at "Check deployment secrets" and production stays as it is.

1. **Vercel token and IDs.**
   - Create a token at vercel.com → Account Settings → Tokens. Scope it to the team that owns the project.
   - Run `npx vercel@62.4.0 link` in the repository root and choose the existing project; don't create a new one. `.vercel/project.json` then holds `orgId` and `projectId`. `.vercel` is git-ignored.
2. **GitHub → Settings → Secrets and variables → Actions:**

   | Kind | Name | Notes |
   | --- | --- | --- |
   | secret | `VERCEL_TOKEN` | |
   | secret | `VERCEL_ORG_ID` | |
   | secret | `VERCEL_PROJECT_ID` | |
   | secret (optional) | `VERCEL_AUTOMATION_BYPASS_SECRET` | Only if Deployment Protection covers the project's `*.vercel.app` URLs (Vercel → Settings → Deployment Protection → Protection Bypass for Automation). Without it the staged smoke test gets 401 and stops. |
   | secret (optional) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Used only by the `verify` check build. |
   | variable | `PRODUCTION_URL` | The production URL, e.g. `https://traveltrack.vercel.app`. |

3. **GitHub → Settings → Environments:**
   - `staging` and `production` are created on the first run if they don't exist.
   - Give both a deployment branch rule that allows only `main`.
   - Add **Required reviewers** to `production` if each release should wait for approval. The pipeline works with or without reviewers.
   - Optionally, move the three `VERCEL_*` secrets into these two environments instead of repository secrets.
4. **GitHub → Settings → Branches:** protect `main` and require the `verify` check and pull requests before merging. Then broken code can't reach `main` in the first place.
5. **Vercel → Project → Settings:**
   - Root Directory must stay `frontend`.
   - Production Branch stays `main`.
   - Production env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set; `vercel pull` reads them.
   - Delete `VITE_TRIPS_ENABLED` if it is still set.
   - **Deployment Checks** aren't needed with this pipeline.
6. **Check it worked:** push a commit and confirm that the Vercel dashboard shows no deployment started by Git, only one created by the CLI from the workflow.

## Deploying to Vercel

The Vercel project imports this repository with **Root Directory** `frontend`. `frontend/vercel.json` sets:

- the Vite framework, `npm ci` and `npm run build`, with output in `dist`;
- the SPA fallback, so deep links like `/app/trips/123` survive a refresh;
- asset caching and the security headers;
- `git.deploymentEnabled: false`, so only the workflow above deploys.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables** for Production (plus the optional `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD`). `VITE_TRIPS_ENABLED` is no longer used. A manual emergency deploy is still possible with `vercel deploy --prod` from a linked checkout, but it skips CI.

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
