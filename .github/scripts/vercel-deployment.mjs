// Vercel REST API calls for the CD jobs in ci.yml: read-only checks, plus
// the production promotion itself. Never prints the token. Node 20+ (global
// fetch), no dependencies.
//
//   node vercel-deployment.mjs ready <deployment-url> <commit-sha>
//     Waits until the deployment is READY and checks that it is a production-
//     target build of <commit-sha> (the ciCommitSha meta set at deploy time).
//     Writes id=<deployment id> to $GITHUB_OUTPUT.
//
//   node vercel-deployment.mjs promote <deployment-id> <commit-sha>
//     Re-checks the deployment as `ready` does and that it belongs to
//     VERCEL_PROJECT_ID, then points the production domains at it (no
//     rebuild) and waits until Vercel reports the promotion as finished.
//     Replaces `vercel promote`, which always calls the user-level
//     GET /v2/user and so fails with "User not found (404)" for a token
//     scoped to a team.
//
//   node vercel-deployment.mjs assert-alias <production-host> <deployment-id>
//     Checks that <production-host> now serves <deployment-id>.
//
// Env: VERCEL_TOKEN (required), VERCEL_ORG_ID (team scope when it is a team
// id), VERCEL_PROJECT_ID (promote), VERCEL_API_URL (tests only),
// DEPLOY_WAIT_SECONDS (default 600).

import { appendFileSync } from "node:fs";

const API = process.env.VERCEL_API_URL || "https://api.vercel.com";
const TOKEN = process.env.VERCEL_TOKEN;
const ORG = process.env.VERCEL_ORG_ID || "";
const PROJECT = process.env.VERCEL_PROJECT_ID || "";
const WAIT_MS = Number(process.env.DEPLOY_WAIT_SECONDS || 600) * 1000;

// Thrown rather than process.exit(): exiting right after a POST on a
// keep-alive connection crashes Node on Windows (libuv assertion).
class Failure extends Error {}

function fail(message) {
  throw new Failure(message);
}

function hostOf(value) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host;
  } catch {
    return fail(`Not a valid deployment URL or host: ${value}`);
  }
}

function api(path, init = {}) {
  const url = new URL(path, API);
  if (ORG.startsWith("team_")) url.searchParams.set("teamId", ORG);
  return fetch(url, { ...init, headers: { Authorization: `Bearer ${TOKEN}` } });
}

// Vercel's error code and message, for failures worth explaining.
async function apiError(res) {
  const error = (await res.json().catch(() => null))?.error;
  return error ? `HTTP ${res.status}, ${error.code ?? "error"}: ${error.message ?? ""}` : `HTTP ${res.status}`;
}

async function getDeployment(idOrHost) {
  const res = await api(`/v13/deployments/${encodeURIComponent(idOrHost)}`);
  if (!res.ok) fail(`Vercel API returned HTTP ${res.status} for ${idOrHost}.`);
  return res.json();
}

function checkStagedBuild(d, sha) {
  if (d.target !== "production") fail("Deployment is not a production-target build.");
  if (d.meta?.ciCommitSha !== sha) {
    fail(`Deployment was built from ${d.meta?.ciCommitSha ?? "an unknown commit"}, expected ${sha}.`);
  }
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function ready(deploymentUrl, sha) {
  const host = hostOf(deploymentUrl);
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const d = await getDeployment(host);
    const state = d.readyState ?? d.status;
    console.log(`Deployment ${d.id}: ${state}, target ${d.target ?? "preview"}`);
    if (state === "READY") {
      checkStagedBuild(d, sha);
      output("id", d.id);
      return;
    }
    if (["ERROR", "CANCELED", "DELETED"].includes(state)) fail(`Deployment ended as ${state}.`);
    if (Date.now() > deadline) fail(`Deployment not READY after ${WAIT_MS / 1000}s (last: ${state}).`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// The same API call `vercel promote` makes, followed by the same wait on the
// project's lastAliasRequest.
async function promote(deploymentId, sha) {
  if (!PROJECT) fail("VERCEL_PROJECT_ID is not set.");
  const d = await getDeployment(deploymentId);
  if (d.id !== deploymentId) fail(`Vercel returned deployment ${d.id}, expected ${deploymentId}.`);
  if ((d.readyState ?? d.status) !== "READY") fail(`Deployment ${d.id} is ${d.readyState ?? d.status}, not READY.`);
  if (d.projectId !== PROJECT) fail(`Deployment ${d.id} does not belong to the project in VERCEL_PROJECT_ID.`);
  checkStagedBuild(d, sha);

  const startedAt = Date.now();
  const res = await api(`/v10/projects/${encodeURIComponent(PROJECT)}/promote/${encodeURIComponent(d.id)}`, {
    method: "POST",
  });
  if (res.status === 202) {
    fail("Promotion was queued behind an active rolling release; production does not serve this deployment yet.");
  }
  if (!res.ok) fail(`Promotion of ${d.id} was refused (${await apiError(res)}).`);
  console.log(`Promotion of ${d.id} requested.`);

  // requestedAt comes from Vercel's clock; allow for skew against ours.
  const recent = startedAt - 3 * 60 * 1000;
  const deadline = startedAt + WAIT_MS;
  for (;;) {
    const p = await api(`/v9/projects/${encodeURIComponent(PROJECT)}`);
    if (!p.ok) fail(`Could not read the promotion status (${await apiError(p)}).`);
    const job = (await p.json()).lastAliasRequest ?? {};
    if (job.toDeploymentId === d.id && job.requestedAt >= recent) {
      if (job.jobStatus === "succeeded") return console.log(`Production domains now point at ${d.id}.`);
      // Vercel skips the job when the domains already point there; assert-alias checks that.
      if (job.jobStatus === "skipped") return console.log(`Promotion skipped by Vercel: domains already at ${d.id}.`);
      if (job.jobStatus === "failed") fail(`Vercel could not move all production domains to ${d.id}.`);
    }
    if (Date.now() > deadline) fail(`Promotion of ${d.id} not finished after ${WAIT_MS / 1000}s (last: ${job.jobStatus ?? "none"}).`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function assertAlias(productionHost, expectedId) {
  const host = hostOf(productionHost);
  // Alias changes can take a moment to show up in the API.
  for (let attempt = 1; attempt <= 12; attempt++) {
    const d = await getDeployment(host);
    if (d.id === expectedId && (d.readyState ?? d.status) === "READY") {
      console.log(`${host} serves ${expectedId}.`);
      return;
    }
    console.log(`Attempt ${attempt}: ${host} serves ${d.id}, waiting for ${expectedId}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  fail(`${host} does not serve the promoted deployment ${expectedId}.`);
}

try {
  if (!TOKEN) fail("VERCEL_TOKEN is not set.");
  const [command, a, b] = process.argv.slice(2);
  if (command === "ready" && a && b) await ready(a, b);
  else if (command === "promote" && a && b) await promote(a, b);
  else if (command === "assert-alias" && a && b) await assertAlias(a, b);
  else fail("Usage: vercel-deployment.mjs ready <url> <sha> | promote <deployment-id> <sha> | assert-alias <host> <deployment-id>");
} catch (err) {
  console.error(`::error::${err instanceof Failure ? err.message : `Unexpected error: ${err.message}`}`);
  process.exitCode = 1;
}
