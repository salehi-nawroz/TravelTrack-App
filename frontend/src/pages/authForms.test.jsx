import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Login from "./Login";
import Signup from "./Signup";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../contexts/AuthContext";

vi.mock("../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const login = vi.fn();
const signup = vi.fn();
const renderPage = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  login.mockReset();
  signup.mockReset();
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, login, signup });
});
afterEach(cleanup);

describe("PasswordInput", () => {
  it("toggles visibility with an accessible button and keeps the label link", () => {
    render(
      <>
        <label htmlFor="pw">Password</label>
        <PasswordInput id="pw" value="secret123" onChange={() => {}} aria-describedby="hint" />
      </>,
    );
    const input = screen.getByLabelText("Password");
    expect(input.type).toBe("password");
    expect(input.getAttribute("aria-describedby")).toBe("hint");

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.type).toBe("button"); // never submits the form
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Login form", () => {
  it("has a heading and labelled fields", () => {
    renderPage(<Login />);
    expect(screen.getByRole("heading", { level: 1, name: "Log in" })).toBeTruthy();
    expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe("username");
    expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("current-password");
  });

  it("explains an empty submit instead of doing nothing", () => {
    renderPage(<Login />);
    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(screen.getByRole("alert").textContent).toBe("Please enter your email address and password.");
    expect(login).not.toHaveBeenCalled();
  });

  it("disables the button while signing in and shows a wrapped, announced error on failure", async () => {
    let reject;
    login.mockImplementation(() => new Promise((_, r) => (reject = r)));
    renderPage(<Login />);
    type("Email address", "someone@example.com");
    type("Password", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    const busy = await screen.findByRole("button", { name: "Logging in…" });
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith("someone@example.com", "wrong-password");

    reject(new Error("Invalid login credentials"));
    expect((await screen.findByRole("alert")).textContent).toBe("Invalid email or password.");
    expect(screen.getByRole("button", { name: "Login" }).disabled).toBe(false);
  });
});

describe("Sign up form", () => {
  const fill = ({ name = "Ada", email = "ada@example.com", password = "longenough", confirm = "longenough" } = {}) => {
    type("Full name", name);
    type("Email address", email);
    type("Password", password);
    type("Confirm password", confirm);
  };

  it("links the password hint to the field", () => {
    renderPage(<Signup />);
    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toBeTruthy();
    const password = screen.getByLabelText("Password");
    const hintId = password.getAttribute("aria-describedby");
    expect(document.getElementById(hintId).textContent).toBe("At least 8 characters.");
  });

  it("keeps the existing rules and shows field errors on the right field", () => {
    renderPage(<Signup />);
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByRole("alert").textContent).toBe("Please fill in all fields.");

    fill({ password: "short", confirm: "short" });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe("Password must be at least 8 characters.");

    fill({ confirm: "different1" });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByLabelText("Confirm password").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Password").getAttribute("aria-invalid")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
    expect(signup).not.toHaveBeenCalled();
  });

  it("disables the button while submitting and calls signup once with trimmed values", async () => {
    let resolve;
    signup.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderPage(<Signup />);
    fill({ name: "  Ada  ", email: " ada@example.com " });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    const busy = await screen.findByRole("button", { name: "Creating account…" });
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(signup).toHaveBeenCalledTimes(1);
    expect(signup).toHaveBeenCalledWith("Ada", "ada@example.com", "longenough");

    resolve({ user: { identities: [{}] }, session: null });
    expect(await screen.findByRole("heading", { level: 1, name: "Check your email" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to log in" }).getAttribute("href")).toBe("/login");
  });

  it("explains an already-registered email with a link to log in", async () => {
    signup.mockResolvedValue({ user: { identities: [] }, session: null });
    renderPage(<Signup />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("This email is already registered. Please log in instead.");
    expect(alert.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it("still redirects a signed-in visitor to the app, from both pages", async () => {
    vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true, login, signup });
    for (const [path, page] of [["/signup", <Signup key="s" />], ["/login", <Login key="l" />]]) {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={path} element={page} />
            <Route path="/app" element={<p>app home</p>} />
          </Routes>
        </MemoryRouter>,
      );
      expect(await screen.findByText("app home")).toBeTruthy();
      cleanup();
    }
  });
});
