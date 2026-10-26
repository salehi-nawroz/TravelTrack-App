// Tests for the admin-delete-user Edge Function logic, with fake Supabase
// clients (no network). Run from the repository root: npm test

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "./handler.js";

const ENV = {
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "SERVICE_ROLE_SECRET",
};
const TOKEN = "CALLER_ACCESS_TOKEN";
const CALLER = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";

let calls;
let logged;
let fake;

// Storage: { bucket: { "path/to/file": true } }. list() returns one level.
function listLevel(files, prefix) {
  const entries = new Map();
  for (const path of Object.keys(files)) {
    if (!path.startsWith(`${prefix}/`)) continue;
    const [first, ...rest] = path.slice(prefix.length + 1).split("/");
    entries.set(first, rest.length ? { name: first, id: null } : { name: first, id: `id-${first}` });
  }
  return [...entries.values()];
}

function reset() {
  calls = [];
  logged = [];
  fake = {
    user: { id: CALLER },
    userError: null,
    rpc: { dry: { data: null, error: null }, real: { data: null, error: null } },
    files: {
      "trip-photos": {
        [`${TARGET}/trip-a/p1.jpg`]: true,
        [`${TARGET}/trip-a/p2.jpg`]: true,
        [`${TARGET}/trip-b/p3.png`]: true,
        [`${CALLER}/trip-c/mine.jpg`]: true,
      },
      avatars: { [`${TARGET}/profile.png`]: true },
    },
    removeError: {},
    keepFiles: false,
  };
}

function createClient(url, key, options) {
  const label = key === ENV.SUPABASE_SERVICE_ROLE_KEY ? "service" : "caller";
  calls.push({ type: "createClient", label, url, key, authorization: options?.global?.headers?.Authorization });
  return {
    auth: {
      getUser: async (token) => {
        calls.push({ type: "getUser", label, token });
        return { data: fake.userError ? null : { user: fake.user }, error: fake.userError };
      },
    },
    rpc: async (name, args) => {
      calls.push({ type: "rpc", label, name, args });
      return args.p_dry_run ? fake.rpc.dry : fake.rpc.real;
    },
    storage: {
      from: (bucket) => ({
        list: async (prefix, options) => {
          calls.push({ type: "list", label, bucket, prefix, options });
          return { data: listLevel(fake.files[bucket], prefix), error: null };
        },
        remove: async (paths) => {
          calls.push({ type: "remove", label, bucket, paths });
          if (fake.removeError[bucket]) return { data: null, error: { message: fake.removeError[bucket] } };
          if (!fake.keepFiles) for (const path of paths) delete fake.files[bucket][path];
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
}

const log = { error: (...args) => logged.push(args.join(" ")) };

function request({ method = "POST", body = { userId: TARGET }, token = TOKEN } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://project.supabase.test/functions/v1/admin-delete-user", {
    method,
    headers,
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

async function call(options, env = ENV) {
  const response = await handleRequest(request(options), { env, createClient, log });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text, body: text && text !== "ok" ? JSON.parse(text) : null };
}

const rpcCalls = () => calls.filter((c) => c.type === "rpc");
const removeCalls = (bucket) => calls.filter((c) => c.type === "remove" && c.bucket === bucket);

function assertNoSecrets(result) {
  for (const secret of [TOKEN, ENV.SUPABASE_SERVICE_ROLE_KEY]) {
    assert.ok(!result.text.includes(secret), "response leaks a secret");
    assert.ok(!logged.some((line) => line.includes(secret)), "log leaks a secret");
  }
}

beforeEach(reset);

describe("request validation", () => {
  test("answers the CORS preflight", async () => {
    const result = await call({ method: "OPTIONS" });
    assert.equal(result.status, 200);
    assert.match(result.headers.get("Access-Control-Allow-Headers"), /authorization/);
    assert.equal(calls.length, 0);
  });

  test("rejects other methods", async () => {
    assert.equal((await call({ method: "GET" })).status, 405);
    assert.equal(calls.length, 0);
  });

  test("requires a bearer token", async () => {
    const result = await call({ token: null });
    assert.equal(result.status, 401);
    assert.equal(calls.length, 0);
  });

  test("requires a valid user id", async () => {
    for (const body of [{}, { userId: "not-a-uuid" }, { userId: 42 }, "not json"]) {
      const result = await call({ body });
      assert.equal(result.status, 400, JSON.stringify(body));
    }
    assert.equal(calls.length, 0);
  });

  test("fails closed when the server isn't configured", async () => {
    const result = await call({}, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "" });
    assert.equal(result.status, 500);
    assert.equal(calls.length, 0);
  });

  test("rejects an invalid or expired session before anything else", async () => {
    fake.userError = { message: "invalid JWT" };
    const result = await call();
    assert.equal(result.status, 401);
    assert.equal(rpcCalls().length, 0);
    assert.equal(calls.filter((c) => c.type === "list" || c.type === "remove").length, 0);
  });
});

describe("authorization comes from admin_delete_user()", () => {
  test("uses the caller's token for the checks and the service role only for Storage", async () => {
    await call();
    const [caller, service] = calls.filter((c) => c.type === "createClient");
    assert.deepEqual(
      { label: caller.label, key: caller.key, authorization: caller.authorization },
      { label: "caller", key: ENV.SUPABASE_ANON_KEY, authorization: `Bearer ${TOKEN}` },
    );
    assert.equal(service.authorization, undefined);
    assert.ok(rpcCalls().every((c) => c.label === "caller"));
    assert.ok(calls.filter((c) => c.type === "list" || c.type === "remove").every((c) => c.label === "service"));
  });

  for (const [code, status, message] of [
    ["42501", 403, "Only a super admin can delete accounts."],
    ["42501", 403, "You can't delete your own account here. Use Profile -> Delete account."],
    ["P0002", 404, "This account doesn't exist, or you can't delete it."],
    ["42501", 403, "The shared demo account cannot be deleted."],
  ]) {
    test(`a refused check (${message}) removes nothing and deletes nothing`, async () => {
      fake.rpc.dry = { data: null, error: { code, message } };
      const result = await call();
      assert.equal(result.status, status);
      assert.equal(result.body.error, message);
      assert.equal(rpcCalls().length, 1);
      assert.equal(calls.filter((c) => c.type === "remove").length, 0);
      assert.equal(Object.keys(fake.files["trip-photos"]).length, 4);
    });
  }
});

describe("deletion", () => {
  test("checks, removes the trip photo files, deletes the account, then removes the avatar", async () => {
    const result = await call();
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { deleted: true, userId: TARGET, warnings: [] });

    assert.deepEqual(
      rpcCalls().map((c) => c.args),
      [
        { target_user_id: TARGET, p_dry_run: true },
        { target_user_id: TARGET, p_dry_run: false },
      ],
    );
    assert.deepEqual(removeCalls("trip-photos")[0].paths.sort(), [
      `${TARGET}/trip-a/p1.jpg`,
      `${TARGET}/trip-a/p2.jpg`,
      `${TARGET}/trip-b/p3.png`,
    ]);
    // Only the target's folder: the caller's own file is untouched.
    assert.deepEqual(Object.keys(fake.files["trip-photos"]), [`${CALLER}/trip-c/mine.jpg`]);
    assert.deepEqual(Object.keys(fake.files.avatars), []);

    const order = calls
      .filter((c) => c.type === "rpc" || c.type === "remove")
      .map((c) => (c.type === "rpc" ? `rpc:${c.args.p_dry_run ? "check" : "delete"}` : `remove:${c.bucket}`));
    assert.deepEqual(order, ["rpc:check", "remove:trip-photos", "rpc:delete", "remove:avatars"]);
    assertNoSecrets(result);
  });

  test("a user without photo files is deleted without any trip photo removal", async () => {
    fake.files["trip-photos"] = {};
    const result = await call();
    assert.equal(result.status, 200);
    assert.equal(removeCalls("trip-photos").length, 0);
  });

  test("files that remain after removal stop the deletion", async () => {
    fake.keepFiles = true;
    const result = await call();
    assert.equal(result.status, 500);
    assert.match(result.body.error, /3 trip photo file\(s\) couldn't be removed, so the account wasn't deleted/);
    assert.equal(rpcCalls().length, 1);
  });

  test("a Storage error stops the deletion and says photos may be gone", async () => {
    fake.removeError["trip-photos"] = "storage unavailable";
    const result = await call();
    assert.equal(result.status, 500);
    assert.match(result.body.error, /account wasn't deleted. Some photos may already be gone/);
    assert.equal(rpcCalls().length, 1);
    assertNoSecrets(result);
  });

  test("a failed delete is never reported as success, and says the files are gone", async () => {
    fake.rpc.real = { data: null, error: { code: "P0002", message: "This account doesn't exist, or you can't delete it." } };
    const result = await call();
    assert.equal(result.status, 404);
    assert.equal(
      result.body.error,
      "The account wasn't deleted: This account doesn't exist, or you can't delete it. Its 3 trip photo file(s) were already removed.",
    );
    assert.equal(removeCalls("avatars").length, 0);
    assert.equal(result.body.deleted, undefined);
  });

  test("an unexpected database error is logged and reported generically", async () => {
    fake.rpc.real = { data: null, error: { code: "XX000", message: "internal detail about tables" } };
    const result = await call();
    assert.equal(result.status, 500);
    assert.doesNotMatch(result.body.error, /internal detail/);
    assert.ok(logged.some((line) => line.includes("internal detail")));
    assertNoSecrets(result);
  });

  test("an avatar that can't be removed is a warning; the account is still deleted", async () => {
    fake.removeError.avatars = "nope";
    const result = await call();
    assert.equal(result.status, 200);
    assert.equal(result.body.deleted, true);
    assert.deepEqual(result.body.warnings, ["The account was deleted, but its profile picture file couldn't be removed."]);
  });
});
