// Read-only checks against the Vercel REST API for the CD jobs in ci.yml.
// Never prints the token. Node 20+ (global fetch), no dependencies.
//
//   node vercel-deployment.mjs ready <deployment-url> <commit-sha>
//     Waits until the deployment is READY and checks that it is a production-
//     target build of <commit-sha> (the ciCommitSha meta set at deploy time).
//     Writes id=<deployment id> to $GITHUB_OUTPUT.
//
//   node vercel-deployment.mjs assert-alias <production-host> <deployment-id>
//     Checks that <production-host> now serves <deployment-id>.
//
// Env: VERCEL_TOKEN (required), VERCEL_ORG_ID (team scope when it is a team
// id), VERCEL_API_URL (tests only), DEPLOY_WAIT_SECONDS (default 600).

import { appendFileSync } from "node:fs";

const API = process.env.VERCEL_API_URL || "https://api.vercel.com";
const TOKEN = process.env.VERCEL_TOKEN;
const ORG = process.env.VERCEL_ORG_ID || "";
const WAIT_MS = Number(process.env.DEPLOY_WAIT_SECONDS || 600) * 1000;

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function hostOf(value) {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host;
  } catch {
    return fail(`Not a valid deployment URL or host: ${value}`);
  }
}

async function getDeployment(idOrHost) {
  const url = new URL(`/v13/deployments/${encodeURIComponent(idOrHost)}`, API);
  if (ORG.startsWith("team_")) url.searchParams.set("teamId", ORG);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) fail(`Vercel API returned HTTP ${res.status} for ${idOrHost}.`);
  return res.json();
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
      if (d.target !== "production") fail("Deployment is not a production-target build.");
      if (d.meta?.ciCommitSha !== sha) {
        fail(`Deployment was built from ${d.meta?.ciCommitSha ?? "an unknown commit"}, expected ${sha}.`);
      }
      output("id", d.id);
      return;
    }
    if (["ERROR", "CANCELED", "DELETED"].includes(state)) fail(`Deployment ended as ${state}.`);
    if (Date.now() > deadline) fail(`Deployment not READY after ${WAIT_MS / 1000}s (last: ${state}).`);
    await new Promise((r) => setTimeout(r, 5000));
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

if (!TOKEN) fail("VERCEL_TOKEN is not set.");
const [command, a, b] = process.argv.slice(2);
if (command === "ready" && a && b) await ready(a, b);
else if (command === "assert-alias" && a && b) await assertAlias(a, b);
else fail("Usage: vercel-deployment.mjs ready <url> <sha> | assert-alias <host> <deployment-id>");
