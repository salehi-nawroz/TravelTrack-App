// In-memory stand-in for services/supabaseClient in unit tests. Nothing
// here talks to a network. Every query, RPC and storage call is appended to
// mockState.calls in order, and answered by a handler registered under:
//   "<table>.<select|insert|update|delete>"  (receives the query state)
//   "rpc.<name>"                             (receives the args)
//   "storage.<remove|list|createSignedUrls>" (receives the arguments)
// Unregistered calls succeed with empty data.
//
// Use in a test file:
//   vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
//   import { mockState, resetSupabaseMock } from "../test/supabaseMock";

export const mockState = {
  calls: [],
  handlers: {},
  user: { id: "user-1" },
  session: { user: { id: "user-1" }, access_token: "token" },
};

export function resetSupabaseMock() {
  mockState.calls = [];
  mockState.handlers = {};
  mockState.user = { id: "user-1" };
  mockState.session = { user: { id: "user-1" }, access_token: "token" };
}

const answer = (key, arg, fallback) =>
  Promise.resolve(mockState.handlers[key] ? mockState.handlers[key](arg) : fallback);

function queryBuilder(table) {
  const state = { table, op: "select", filters: [], payload: null };
  const record = (type, ...args) => {
    state.filters.push([type, ...args]);
    return builder;
  };

  const builder = {
    select(columns) {
      if (state.op === "select") state.columns = columns;
      else state.returning = columns;
      return builder;
    },
    insert(payload) {
      state.op = "insert";
      state.payload = payload;
      return builder;
    },
    update(payload) {
      state.op = "update";
      state.payload = payload;
      return builder;
    },
    delete() {
      state.op = "delete";
      return builder;
    },
    eq: (column, value) => record("eq", column, value),
    in: (column, values) => record("in", column, values),
    is: (column, value) => record("is", column, value),
    not: (column, op, value) => record("not", column, op, value),
    order: () => builder,
    single() {
      state.single = true;
      return builder;
    },
    maybeSingle() {
      state.single = true;
      return builder;
    },
    then(resolve, reject) {
      mockState.calls.push({ type: "query", ...state });
      return answer(`${table}.${state.op}`, state, { data: state.single ? null : [], error: null }).then(
        resolve,
        reject,
      );
    },
  };
  return builder;
}

const supabase = {
  from: (table) => queryBuilder(table),

  rpc(name, args) {
    mockState.calls.push({ type: "rpc", name, args });
    return answer(`rpc.${name}`, args, { data: null, error: null });
  },

  storage: {
    from: (bucket) => ({
      remove(paths) {
        mockState.calls.push({ type: "storage.remove", bucket, paths });
        return answer("storage.remove", paths, {
          data: paths.map((name) => ({ name })),
          error: null,
        });
      },
      list(prefix, options) {
        mockState.calls.push({ type: "storage.list", bucket, prefix, options });
        return answer("storage.list", prefix, { data: [], error: null });
      },
      createSignedUrls(paths) {
        mockState.calls.push({ type: "storage.createSignedUrls", bucket, paths });
        return answer("storage.createSignedUrls", paths, {
          data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
          error: null,
        });
      },
    }),
  },

  auth: {
    getUser: () => Promise.resolve({ data: { user: mockState.user }, error: null }),
    getSession: () => Promise.resolve({ data: { session: mockState.session }, error: null }),
  },
};

export default supabase;
