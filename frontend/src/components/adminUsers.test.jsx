import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AdminUsers from "./AdminUsers";
import { adminDeleteUser } from "../services/accountService";

vi.mock("../services/supabaseClient", () => import("../test/supabaseMock"));
vi.mock("../services/accountService", () => ({ adminDeleteUser: vi.fn() }));

const users = [
  { id: "u1", fullName: "Una User", email: "una@example.test", role: "user", avatarPath: null, createdAt: "2026-01-01" },
  { id: "a1", fullName: "Ada Admin", email: "ada@example.test", role: "admin", avatarPath: null, createdAt: "2026-01-02" },
  { id: "a2", fullName: "Abe Admin", email: "abe@example.test", role: "admin", avatarPath: null, createdAt: "2026-01-03" },
  { id: "s1", fullName: "Sam Super", email: "sam@example.test", role: "super_admin", avatarPath: null, createdAt: "2026-01-04" },
];

function renderUsers(viewer, props = {}) {
  const onUserDeleted = vi.fn();
  render(
    <AdminUsers
      users={users}
      isLoadingUsers={false}
      usersError=""
      onRetry={vi.fn()}
      cities={[]}
      viewer={viewer}
      onUserDeleted={onUserDeleted}
      {...props}
    />,
  );
  return { onUserDeleted };
}

const openUser = (name) => fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
const deleteButton = () => screen.queryByRole("button", { name: "Delete account" });

// A block body: a function returned from beforeEach would run as teardown.
beforeEach(() => {
  vi.mocked(adminDeleteUser).mockReset();
});
afterEach(cleanup);

describe("Admin -> Users: Delete account", () => {
  it("is offered to an admin for users and other admins", () => {
    renderUsers({ id: "a1", role: "admin" });
    openUser("Una User");
    expect(deleteButton()).toBeTruthy();
    // The dialog has an × "Close" button too; use the text button.
    fireEvent.click(screen.getAllByRole("button", { name: "Close" }).at(-1));
    openUser("Abe Admin");
    expect(deleteButton()).toBeTruthy();
  });

  it("is never offered for your own account", () => {
    renderUsers({ id: "a1", role: "admin" });
    openUser("Ada Admin");
    expect(deleteButton()).toBeNull();
  });

  it("is never offered to an admin for a super admin", () => {
    renderUsers({ id: "a1", role: "admin" });
    openUser("Sam Super");
    expect(deleteButton()).toBeNull();
  });

  it("is offered to a super admin for another super admin", () => {
    renderUsers({ id: "s2", role: "super_admin" });
    openUser("Sam Super");
    expect(deleteButton()).toBeTruthy();
  });

  it("is never offered to a regular user", () => {
    renderUsers({ id: "u9", role: "user" });
    openUser("Una User");
    expect(deleteButton()).toBeNull();
  });

  it("asks first, then removes the user only after the server confirms", async () => {
    vi.mocked(adminDeleteUser).mockResolvedValue({ warnings: [] });
    const { onUserDeleted } = renderUsers({ id: "a1", role: "admin" });
    openUser("Una User");
    fireEvent.click(deleteButton());

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Una User");
    expect(dialog.textContent).toContain("una@example.test");
    expect(adminDeleteUser).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete account" }));
    await waitFor(() => expect(onUserDeleted).toHaveBeenCalledWith("u1"));
    expect(adminDeleteUser).toHaveBeenCalledWith("u1");
    expect(screen.getByRole("status").textContent).toContain("Deleted Una User's account.");
  });

  it("cancelling deletes nothing", () => {
    const { onUserDeleted } = renderUsers({ id: "a1", role: "admin" });
    openUser("Una User");
    fireEvent.click(deleteButton());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(adminDeleteUser).not.toHaveBeenCalled();
    expect(onUserDeleted).not.toHaveBeenCalled();
  });

  it("shows the server's reason and keeps the user when deletion fails", async () => {
    vi.mocked(adminDeleteUser).mockRejectedValue(new Error("This account doesn't exist, or you can't delete it."));
    const { onUserDeleted } = renderUsers({ id: "a1", role: "admin" });
    openUser("Una User");
    fireEvent.click(deleteButton());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete account" }));

    expect(
      await screen.findByText("Couldn't delete Una User's account. This account doesn't exist, or you can't delete it."),
    ).toBeTruthy();
    expect(onUserDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Una User/ })).toBeTruthy();
  });

  it("shows warnings from a deletion that succeeded", async () => {
    vi.mocked(adminDeleteUser).mockResolvedValue({
      warnings: ["The account was deleted, but its profile picture file couldn't be removed."],
    });
    renderUsers({ id: "s2", role: "super_admin" });
    openUser("Una User");
    fireEvent.click(deleteButton());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete account" }));
    expect(await screen.findByText(/profile picture file couldn't be removed/)).toBeTruthy();
  });
});
