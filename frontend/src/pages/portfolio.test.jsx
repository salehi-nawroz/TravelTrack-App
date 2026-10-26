import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";
import Homepage from "./Homepage";
import Footer from "../components/Footer";
import Profile from "../components/Profile";
import { useAuth } from "../contexts/AuthContext";

const demo = vi.hoisted(() => ({ account: null }));
const REPO = "https://github.com/salehi-nawroz/TravelTrack-App";

vi.mock("../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../config/portfolio", () => ({
  get DEMO_ACCOUNT() {
    return demo.account;
  },
  isDemoAccount: (email) => Boolean(demo.account && email === demo.account.email),
  SOURCE_REPO_URL: "https://github.com/salehi-nawroz/TravelTrack-App",
}));
vi.mock("../components/SampleTripMap", () => ({ default: () => null }));

const login = vi.fn();
const renderAt = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);
const DEMO = { email: "demo@example.com", password: "public-demo-pass" };

beforeEach(() => {
  demo.account = null;
  login.mockReset();
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, login });
});
afterEach(cleanup);

describe("demo account on the login page", () => {
  it("is hidden when no demo account is configured", () => {
    renderAt(<Login />);
    expect(screen.queryByRole("heading", { name: "Try the Demo Account" })).toBeNull();
  });

  it("shows the credentials and fills the form without signing in", () => {
    demo.account = DEMO;
    renderAt(<Login />);
    expect(screen.getByRole("heading", { level: 2, name: "Try the Demo Account" })).toBeTruthy();
    expect(screen.getByText(DEMO.email)).toBeTruthy();
    expect(screen.getByText(/portfolio testing/)).toBeTruthy();

    const fill = screen.getByRole("button", { name: "Fill Demo Credentials" });
    expect(fill.type).toBe("button");
    fireEvent.click(fill);
    expect(screen.getByLabelText("Email address").value).toBe(DEMO.email);
    expect(screen.getByLabelText("Password").value).toBe(DEMO.password);
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/select Login/);

    fireEvent.click(screen.getByRole("button", { name: "Login" }));
    expect(login).toHaveBeenCalledWith(DEMO.email, DEMO.password);
  });

  it("copies each value to the clipboard and says so", async () => {
    demo.account = DEMO;
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderAt(<Login />);

    await act(() => fireEvent.click(screen.getByRole("button", { name: "Copy demo password" })));
    expect(writeText).toHaveBeenCalledWith(DEMO.password);
    expect(screen.getByRole("status").textContent).toBe("Password copied to the clipboard.");

    writeText.mockRejectedValueOnce(new Error("denied"));
    await act(() => fireEvent.click(screen.getByRole("button", { name: "Copy demo email" })));
    expect(screen.getByRole("status").textContent).toMatch(/Couldn't copy the email/);
  });
});

describe("source code links", () => {
  it("the footer has no repository link", () => {
    render(<Footer />);
    expect(screen.queryByRole("link", { name: /View Source Code/ })).toBeNull();
  });

  it("the home page offers Explore TravelTrack and View on GitHub", () => {
    renderAt(<Homepage />);
    expect(screen.getByRole("link", { name: "Explore TravelTrack" }).getAttribute("href")).toBe("/login");
    const github = screen.getByRole("link", { name: /View on GitHub/ });
    expect(github.getAttribute("href")).toBe(REPO);
    expect(github.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("profile of the demo account", () => {
  const profileAuth = (email) => ({
    user: { id: "u1", email },
    profile: { full_name: "Demo", role: "user" },
    updateProfile: vi.fn(),
    avatarUrl: null,
    uploadAvatar: vi.fn(),
    removeAvatar: vi.fn(),
    changePassword: vi.fn(),
    deleteAccount: vi.fn(),
  });

  it("can't change its password or delete itself", () => {
    demo.account = DEMO;
    vi.mocked(useAuth).mockReturnValue(profileAuth(DEMO.email));
    renderAt(<Profile />);
    expect(screen.getByText(/Password changes are turned off/)).toBeTruthy();
    expect(screen.getByText(/can't be deleted/)).toBeTruthy();
    expect(screen.queryByLabelText("New password")).toBeNull();
    expect(screen.queryByLabelText("Confirm your password")).toBeNull();
  });

  it("other users keep both forms", () => {
    demo.account = DEMO;
    vi.mocked(useAuth).mockReturnValue(profileAuth("someone@example.com"));
    renderAt(<Profile />);
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.getByLabelText("Confirm your password")).toBeTruthy();
  });
});
