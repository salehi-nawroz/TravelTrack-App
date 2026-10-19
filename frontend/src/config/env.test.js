import { describe, expect, it } from "vitest";
import { getConfigProblems } from "./env";

// A JWT-shaped key with the given role claim (signature irrelevant here).
const jwt = (role) =>
  ["e30", btoa(JSON.stringify({ role })).replace(/=+$/, ""), "sig"].join(".");
const url = "https://demo-project.supabase.co";

describe("startup configuration check", () => {
  it("accepts a project URL with an anon or publishable key", () => {
    expect(getConfigProblems({ url, anonKey: jwt("anon") })).toEqual([]);
    expect(getConfigProblems({ url, anonKey: "sb_publishable_abc" })).toEqual([]);
  });

  it("names missing or malformed variables without echoing their values", () => {
    expect(getConfigProblems({ url: "", anonKey: "" })).toEqual([
      "VITE_SUPABASE_URL is not set.",
      "VITE_SUPABASE_ANON_KEY is not set.",
    ]);
    const problems = getConfigProblems({ url: "not a url", anonKey: "k" });
    expect(problems).toEqual(["VITE_SUPABASE_URL is not a valid http(s) URL."]);
    expect(problems.join(" ")).not.toContain("not a url");
  });

  it("refuses to start with a secret / service-role key in the browser", () => {
    for (const anonKey of [jwt("service_role"), "sb_secret_abc"]) {
      const [problem] = getConfigProblems({ url, anonKey });
      expect(problem).toMatch(/secret \(service-role\) key/);
      expect(problem).not.toContain(anonKey);
    }
  });
});
