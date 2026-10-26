import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockState, resetSupabaseMock } from "../test/supabaseMock";
import { adminDeleteUser } from "./accountService";
import { deleteCity } from "./cityService";
import { canDeleteTrip, canManageTrip } from "../utils/tripPermissions";
import { canDeleteUser } from "../utils/userPermissions";

vi.mock("./supabaseClient", () => import("../test/supabaseMock"));

beforeEach(resetSupabaseMock);

// What supabase-js returns for a non-2xx Edge Function response.
const httpError = (body) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: { json: () => Promise.resolve(body) } },
});

describe("adminDeleteUser", () => {
  it("calls the admin-delete-user function with the user id", async () => {
    mockState.handlers["functions.admin-delete-user"] = () => ({
      data: { deleted: true, userId: "u1", warnings: [] },
      error: null,
    });
    await expect(adminDeleteUser("u1")).resolves.toEqual({ warnings: [] });
    expect(mockState.calls).toEqual([{ type: "functions.invoke", name: "admin-delete-user", body: { userId: "u1" } }]);
  });

  it("passes on warnings from a deletion that succeeded", async () => {
    mockState.handlers["functions.admin-delete-user"] = () => ({
      data: { deleted: true, userId: "u1", warnings: ["avatar left"] },
      error: null,
    });
    await expect(adminDeleteUser("u1")).resolves.toEqual({ warnings: ["avatar left"] });
  });

  it("throws the server's message when the deletion is refused", async () => {
    mockState.handlers["functions.admin-delete-user"] = () =>
      httpError({ error: "This account doesn't exist, or you can't delete it." });
    await expect(adminDeleteUser("u1")).rejects.toThrow("This account doesn't exist, or you can't delete it.");
  });

  it("throws a generic message when the error has no readable body", async () => {
    mockState.handlers["functions.admin-delete-user"] = () => ({
      data: null,
      error: { name: "FunctionsFetchError", message: "Failed to send a request" },
    });
    await expect(adminDeleteUser("u1")).rejects.toThrow("Couldn't delete this account. Please try again.");
  });

  it("never reports success without the server confirming it", async () => {
    mockState.handlers["functions.admin-delete-user"] = () => ({ data: {}, error: null });
    await expect(adminDeleteUser("u1")).rejects.toThrow(/Couldn't confirm/);
  });
});

describe("deleteCity (Admin -> Cities)", () => {
  it("deletes the city and asks for the deleted row back", async () => {
    mockState.handlers["cities.delete"] = () => ({ data: [{ id: "c1" }], error: null });
    await expect(deleteCity("c1")).resolves.toBeUndefined();
    const [call] = mockState.calls;
    expect(call).toMatchObject({ table: "cities", op: "delete", returning: "id" });
    expect(call.filters).toEqual([["eq", "id", "c1"]]);
  });

  it("treats a delete that RLS blocked (no rows) as a failure", async () => {
    mockState.handlers["cities.delete"] = () => ({ data: [], error: null });
    await expect(deleteCity("c1")).rejects.toThrow(/don't have permission to delete it/);
  });

  it("passes on database errors", async () => {
    mockState.handlers["cities.delete"] = () => ({ data: null, error: { message: "boom" } });
    await expect(deleteCity("c1")).rejects.toThrow("boom");
  });
});

describe("canDeleteTrip", () => {
  const trip = { id: "t1", userId: "owner" };

  it("allows the owner and super admins only", () => {
    expect(canDeleteTrip(trip, { id: "owner", role: "user" })).toBe(true);
    expect(canDeleteTrip(trip, { id: "owner", role: "admin" })).toBe(true);
    expect(canDeleteTrip(trip, { id: "s1", role: "super_admin" })).toBe(true);
    expect(canDeleteTrip(trip, { id: "a1", role: "admin" })).toBe(false);
    expect(canDeleteTrip(trip, { id: "u2", role: "user" })).toBe(false);
    expect(canDeleteTrip(trip, null)).toBe(false);
    expect(canDeleteTrip(null, { id: "owner", role: "user" })).toBe(false);
  });

  it("leaves a plain admin's edit rights alone", () => {
    expect(canManageTrip(trip, { id: "a1", role: "admin" }, "user")).toBe(true);
    expect(canDeleteTrip(trip, { id: "a1", role: "admin" })).toBe(false);
  });
});

describe("canDeleteUser", () => {
  const user = (id, role) => ({ id, role });

  it("never lets a plain admin delete any account", () => {
    const admin = { id: "a1", role: "admin" };
    expect(canDeleteUser(user("u1", "user"), admin)).toBe(false);
    expect(canDeleteUser(user("a2", "admin"), admin)).toBe(false);
    expect(canDeleteUser(user("s1", "super_admin"), admin)).toBe(false);
    expect(canDeleteUser(user("a1", "admin"), admin)).toBe(false);
  });

  it("lets a super admin delete anyone but themselves", () => {
    const superAdmin = { id: "s1", role: "super_admin" };
    expect(canDeleteUser(user("s2", "super_admin"), superAdmin)).toBe(true);
    expect(canDeleteUser(user("a1", "admin"), superAdmin)).toBe(true);
    expect(canDeleteUser(user("s1", "super_admin"), superAdmin)).toBe(false);
  });

  it("never lets a regular user or a signed-out viewer delete", () => {
    expect(canDeleteUser(user("u2", "user"), { id: "u1", role: "user" })).toBe(false);
    expect(canDeleteUser(user("u2", "user"), null)).toBe(false);
  });
});
