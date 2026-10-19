import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectRoute from "./ProtectRoute";
import Login from "./Login";
import PageNotFound from "./PageNotFound";
import Footer from "../components/Footer";
import { useAuth } from "../contexts/AuthContext";
import { getLoginErrorMessage } from "../utils/authErrors";

vi.mock("../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const signedOut = { isAuthenticated: false, isLoading: false, login: vi.fn() };

function renderApp(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/app/*"
          element={
            <ProtectRoute>
              <p>app content</p>
            </ProtectRoute>
          }
        />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.mocked(useAuth).mockReturnValue(signedOut));
afterEach(cleanup);

describe("protected routes", () => {
  it("shows a spinner, not the app, while the session is being restored", () => {
    vi.mocked(useAuth).mockReturnValue({ ...signedOut, isLoading: true });
    renderApp("/app/trips");
    expect(screen.queryByText("app content")).toBeNull();
  });

  it("sends a signed-out visitor to the login page", async () => {
    renderApp("/app/trips/123?tab=photos");
    expect(await screen.findByRole("heading", { level: 1, name: "Log in" })).toBeTruthy();
    expect(screen.queryByText("app content")).toBeNull();
  });

  it("after signing in, returns to the page that was asked for", async () => {
    vi.mocked(useAuth).mockReturnValue({ ...signedOut, isAuthenticated: true });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/app/trips/123" } }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/app/trips/123" element={<p>trip 123</p>} />
          <Route path="/app" element={<p>app home</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("trip 123")).toBeTruthy();
  });

  it("never follows a return address outside the app", async () => {
    vi.mocked(useAuth).mockReturnValue({ ...signedOut, isAuthenticated: true });
    for (const from of ["//evil.example", "https://evil.example/app", "/\\evil.example", "/application", "/login"]) {
      render(
        <MemoryRouter initialEntries={[{ pathname: "/login", state: { from } }]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/app" element={<p>app home</p>} />
            <Route path="*" element={<p>followed {from}</p>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText("app home")).toBeTruthy();
      cleanup();
    }
  });
});

describe("login error messages", () => {
  it("keeps wrong credentials vague but explains other failures", () => {
    expect(getLoginErrorMessage(new Error("Invalid login credentials"))).toBe("Invalid email or password.");
    expect(getLoginErrorMessage({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toMatch(/couldn't reach the server/);
    expect(getLoginErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" })).toMatch(/confirm your email/);
    expect(getLoginErrorMessage({ status: 429, message: "Too many" })).toMatch(/Too many attempts/);
  });
});

describe("404 page and footer", () => {
  it("offers a way home from an unknown address", () => {
    renderApp("/no-such-page");
    expect(screen.getByRole("heading", { level: 1, name: "This page doesn't exist" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
    expect(document.title).toBe("Page not found · TravelTrack");
  });

  it("shows the technology credit only where asked (public pages)", () => {
    const { rerender } = render(<Footer />);
    expect(screen.queryByText(/Claude Code/)).toBeNull();
    rerender(<Footer showCredits />);
    expect(
      screen.getByText("Built with React, Supabase and Leaflet, with AI-assisted development using Claude Code."),
    ).toBeTruthy();
  });
});
