// Smoke test for a deployed TravelTrack build. Node 20+, no dependencies.
//
//   node smoke-test.mjs <base-url>
//
// Checks that the SPA shell, its JS/CSS, deep links (SPA rewrite), static
// data and the security headers from frontend/vercel.json are served, and that
// the bundle was built with a real Supabase URL rather than placeholders.
// It does NOT sign in or touch Supabase data: it proves the deployment is
// served correctly, not that every feature works.
//
// Env: VERCEL_AUTOMATION_BYPASS_SECRET (optional; needed when Deployment
// Protection covers the URL), SMOKE_REPORT (optional path for a JSON report).
// Writes html_sha256=<hash of index.html> to $GITHUB_OUTPUT.

import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";

const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error("Usage: smoke-test.mjs <base-url>");
  process.exit(2);
}

const headers = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
}

async function get(path) {
  const url = new URL(path, base);
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers, redirect: "manual" });
      if (res.status < 500) return { res, body: await res.text() };
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`${url.pathname}: ${lastError.message}`);
}

const isHtmlShell = ({ res, body }) =>
  res.status === 200 &&
  (res.headers.get("content-type") ?? "").includes("text/html") &&
  body.includes('<div id="root">');

async function run() {
  const home = await get("/");
  if (home.res.status === 401 || home.res.status === 403) {
    check("home page reachable", false, `HTTP ${home.res.status}: Deployment Protection is on; set VERCEL_AUTOMATION_BYPASS_SECRET`);
    return null;
  }
  check("home page serves the app shell", isHtmlShell(home), `HTTP ${home.res.status}`);
  const htmlHash = createHash("sha256").update(home.body).digest("hex");

  const h = home.res.headers;
  const csp = h.get("content-security-policy") ?? "";
  check("Content-Security-Policy header", csp.includes("default-src 'self'"));
  const connectSrc = csp.split(";").map((d) => d.trim().split(/\s+/)).find(([n]) => n === "connect-src") ?? [];
  check("CSP allows reverse geocoding (api-bdc.io)", connectSrc.includes("https://api-bdc.io"));
  check("X-Frame-Options DENY", h.get("x-frame-options") === "DENY");
  check("X-Content-Type-Options nosniff", h.get("x-content-type-options") === "nosniff");
  check("Referrer-Policy header", Boolean(h.get("referrer-policy")));

  const script = home.body.match(/<script[^>]+type="module"[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
  check("module script referenced", Boolean(script), script ?? "none");
  if (script) {
    const js = await get(script);
    check("main bundle served", js.res.status === 200 && /javascript/.test(js.res.headers.get("content-type") ?? ""), `HTTP ${js.res.status}`);
    check("assets cached immutably", (js.res.headers.get("cache-control") ?? "").includes("immutable"));
    check("bundle points at a Supabase project", /https:\/\/[a-z0-9-]+\.supabase\.co/.test(js.body));
    check(
      "bundle has no placeholder config",
      !js.body.includes("ci-placeholder") && !js.body.includes("your-project-ref"),
    );
  }

  const css = home.body.match(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"/)?.[1];
  if (css) {
    const sheet = await get(css);
    check("stylesheet served", sheet.res.status === 200, `HTTP ${sheet.res.status}`);
  }

  for (const path of ["/explore", "/login", "/app/trips", "/app/trips/00000000-0000-0000-0000-000000000000", "/app/stats"]) {
    check(`deep link ${path} serves the app shell`, isHtmlShell(await get(path)));
  }

  for (const path of ["/icon.svg", "/data/countries-110m.geojson"]) {
    const asset = await get(path);
    check(`static file ${path}`, asset.res.status === 200, `HTTP ${asset.res.status}`);
  }

  return htmlHash;
}

let htmlHash = null;
try {
  htmlHash = await run();
} catch (err) {
  check("requests completed", false, err.message);
}

const failed = results.filter((r) => !r.ok);
const summary = [
  `### Smoke test: ${failed.length ? "FAILED" : "passed"} (${results.length - failed.length}/${results.length})`,
  "",
  ...results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`),
  "",
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.SMOKE_REPORT) {
  writeFileSync(process.env.SMOKE_REPORT, JSON.stringify({ base: new URL(base).host, htmlHash, results }, null, 2));
}
if (htmlHash && process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `html_sha256=${htmlHash}\n`);
process.exitCode = failed.length ? 1 : 0;
