import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App } from "../app";
import { ApiError, request, signIn } from "../api";
import { claimed, deferred, ticket, user } from "./fixtures";
import type { Ticket, User } from "../types";

vi.mock("../api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api")>()),
  request: vi.fn(),
  signIn: vi.fn(),
}));
const api = vi.mocked(request);
const login = vi.mocked(signIn);
const reject = (status = 503) => new ApiError("Please try again.", status);
function signedIn({
  mobile = false,
  tickets = [ticket],
}: { mobile?: boolean; tickets?: Ticket[] } = {}) {
  vi.stubGlobal("matchMedia", () => ({ matches: mobile }));
  api.mockImplementation(
    async (path) =>
      ({
        "/me": user,
        "/tickets": tickets,
        "/tickets/1": ticket,
        "/logout": { ok: true },
      })[path as "/me"],
  );
}
async function mountLogin() {
  api.mockRejectedValueOnce(reject(401));
  render(<App />);
  await screen.findByRole("heading", { name: "Sign in" });
}
function submit() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "sara@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "workshop123" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
}
async function mountInbox() {
  render(<App />);
  await screen.findByRole("heading", { name: ticket.subject });
}
beforeEach(() => {
  vi.resetAllMocks();
  signedIn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("signs in, toggles password visibility, opens a ticket and signs out", async () => {
  await mountLogin();
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe(
    "text",
  );
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe(
    "password",
  );
  const pending = deferred<User>();
  login.mockReturnValue(pending.promise);
  submit();
  expect(
    (screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => {
    pending.resolve(user);
  });
  await screen.findByRole("heading", { name: ticket.subject });
  expect(login).toHaveBeenCalledWith("sara@example.test", "workshop123");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in" });
});
it("preserves credentials and permits retry after login failure", async () => {
  await mountLogin();
  login.mockRejectedValue(reject(401));
  submit();
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Please try again."),
  );
  expect(
    (screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
    "sara@example.test",
  );
  login.mockResolvedValue(user);
  submit();
  await screen.findByRole("heading", { name: ticket.subject });
});
it("opens a ticket on mobile and returns focus to the queue", async () => {
  signedIn({ mobile: true });
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "Ticket inbox" });
  expect(
    container.querySelector(".workspace")!.classList.contains("has-detail"),
  ).toBe(false);
  expect(screen.getByText("Select a ticket to read its details.")).toBeTruthy();
  const row = screen.getByRole("button", { name: /#1 Invoice export/ });
  fireEvent.click(row);
  const heading = await screen.findByRole("heading", { name: ticket.subject });
  expect(document.activeElement).toBe(heading);
  expect(row.getAttribute("aria-current")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
  expect(
    container.querySelector(".workspace")!.classList.contains("has-detail"),
  ).toBe(false);
  expect(document.activeElement).toBe(row);
});
it("renders an empty inbox without requesting a ticket", async () => {
  signedIn({ tickets: [] });
  render(<App />);
  await screen.findByText("No tickets yet. New requests will appear here.");
  expect(screen.getByText("There are no tickets to open.")).toBeTruthy();
  expect(api).toHaveBeenCalledTimes(2);
});
it("recovers from startup failure through Try again", async () => {
  api.mockRejectedValueOnce(reject());
  render(<App />);
  await screen.findByText("Please try again.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("heading", { name: ticket.subject });
});
it.each([401, 503])("handles a failed ticket list (%i)", async (status) => {
  api.mockResolvedValueOnce(user).mockRejectedValueOnce(reject(status));
  render(<App />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      status === 401 ? "session has expired" : "Please try again.",
    ),
  );
});
it.each([401, 503])("handles a failed ticket detail (%i)", async (status) => {
  api
    .mockResolvedValueOnce(user)
    .mockResolvedValueOnce([ticket])
    .mockRejectedValueOnce(reject(status));
  render(<App />);
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      status === 401 ? "session has expired" : "Please try again.",
    ),
  );
});
it("shows recoverable logout failures", async () => {
  await mountInbox();
  api.mockRejectedValueOnce(reject());
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("button", { name: "Try again" });
});
it.each(["resolve", "reject"] as const)(
  "ignores a stale ticket %s after a newer selection",
  async (outcome) => {
    signedIn({
      mobile: true,
      tickets: [ticket, { ...ticket, id: 2, subject: "Second" }],
    });
    render(<App />);
    await screen.findByRole("heading", { name: "Ticket inbox" });
    const first = deferred<Ticket>();
    api
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ ...ticket, id: 2, subject: "Second" });
    fireEvent.click(screen.getByRole("button", { name: /#1 Invoice export/ }));
    expect(screen.getByRole("status").textContent).toBe("Loading ticket…");
    fireEvent.click(screen.getByRole("button", { name: /#2 Second/ }));
    await screen.findByRole("heading", { name: "Second" });
    await act(async () => {
      if (outcome === "resolve") first.resolve(ticket);
      else first.reject(reject());
    });
    expect(screen.getByRole("heading", { name: "Second" })).toBeTruthy();
  },
);
it("ignores a ticket response after signing out", async () => {
  await mountInbox();
  const pending = deferred<Ticket>();
  api.mockImplementationOnce(() => pending.promise);
  fireEvent.click(screen.getByRole("button", { name: /#1 Invoice export/ }));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("heading", { name: "Sign in" });
  await act(async () => {
    pending.resolve(ticket);
  });
  expect(screen.queryByRole("heading", { name: ticket.subject })).toBeNull();
});
it.each(["resolve", "reject"] as const)(
  "ignores startup %s after unmount",
  async (outcome) => {
    const pending = deferred<User>();
    api.mockImplementationOnce(() => pending.promise);
    const { unmount } = render(<App />);
    expect(screen.getByRole("status").textContent).toBe("Opening Desk…");
    unmount();
    await act(async () => {
      if (outcome === "resolve") pending.resolve(user);
      else pending.reject(reject());
    });
    expect(api).toHaveBeenCalledTimes(1);
  },
);
it.each(["resolve", "reject"] as const)(
  "ignores ticket list %s after unmount",
  async (outcome) => {
    const pending = deferred<Ticket[]>();
    api
      .mockResolvedValueOnce(user)
      .mockImplementationOnce(() => pending.promise);
    const { unmount } = render(<App />);
    await waitFor(() => expect(api).toHaveBeenCalledWith("/tickets"));
    unmount();
    await act(async () => {
      if (outcome === "resolve") pending.resolve([ticket]);
      else pending.reject(reject());
    });
    expect(api).toHaveBeenCalledTimes(2);
  },
);
it("ignores login success after unmount", async () => {
  await mountLogin();
  const pending = deferred<User>();
  login.mockReturnValue(pending.promise);
  submit();
  cleanup();
  await act(async () => {
    pending.resolve(user);
  });
  expect(api).toHaveBeenCalledTimes(1);
});
it.each(["resolve", "reject"] as const)(
  "ignores logout %s after unmount",
  async (outcome) => {
    await mountInbox();
    const pending = deferred<unknown>();
    api.mockImplementationOnce(() => pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    cleanup();
    await act(async () => {
      if (outcome === "resolve") pending.resolve({ ok: true });
      else pending.reject(reject());
    });
  },
);

it.each(["agent", "customer"] as const)(
  "shows all tickets for agents and only owned tickets for customers (%s)",
  async (role) => {
    const actor = { ...user, id: 3, role };
    const other = {
      ...ticket,
      id: 2,
      customer_id: 4,
      subject: "Other customer",
      customer: "Bilal",
    };
    api
      .mockResolvedValueOnce(actor)
      .mockResolvedValueOnce([other, ticket])
      .mockResolvedValueOnce(role === "agent" ? other : ticket);
    render(<App />);
    await screen.findByRole("heading", {
      name: role === "agent" ? other.subject : ticket.subject,
    });
    expect(screen.getAllByRole("button", { name: /#[12]/ })).toHaveLength(
      role === "agent" ? 2 : 1,
    );
    if (role === "customer") {
      expect(
        screen.queryByRole("button", { name: /Other customer/ }),
      ).toBeNull();
      expect(api).not.toHaveBeenCalledWith("/tickets/2");
    }
  },
);
it("shows an empty inbox when a customer owns none of the returned tickets", async () => {
  api
    .mockResolvedValueOnce({ ...user, id: 99, role: "customer" })
    .mockResolvedValueOnce([ticket]);
  render(<App />);
  await screen.findByText("No tickets yet. New requests will appear here.");
  expect(api).toHaveBeenCalledTimes(2);
});

const assigned = { ...ticket, assignee_id: 1, assignee: "Sara" };
const claimButton = () => screen.getByRole("button", { name: "Assign to me" });

it("claims a ticket once, shows the assignee, and keeps focus on the ticket", async () => {
  await mountInbox();
  expect(screen.getByText("Unassigned")).toBeTruthy();
  const pending = deferred<Ticket>();
  api.mockImplementationOnce(() => pending.promise);
  fireEvent.click(claimButton());
  const busy = screen.getByRole("button", { name: "Assigning…" });
  expect((busy as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(busy);
  await act(async () => {
    pending.resolve(assigned);
  });
  expect(screen.getByText("Assigned to Sara")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: ticket.subject }),
  );
  const claims = api.mock.calls.filter(
    ([path]) => path === "/tickets/1/assign",
  );
  expect(claims).toEqual([["/tickets/1/assign", { method: "POST" }]]);
});
it("explains a lost race and refreshes to the winner's assignment", async () => {
  await mountInbox();
  api.mockRejectedValueOnce(
    new ApiError("This ticket is already assigned to Omar.", 409),
  );
  fireEvent.click(claimButton());
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe(
      "This ticket is already assigned to Omar.",
    ),
  );
  expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
  api.mockResolvedValueOnce(claimed);
  fireEvent.click(screen.getByRole("button", { name: "Refresh assignment" }));
  await screen.findByText("Assigned to Omar");
  expect(screen.getByRole("alert").textContent).toBe("");
  expect(api).toHaveBeenLastCalledWith("/tickets/1");
});
it("keeps the ticket unassigned and allows a retry after a failed claim", async () => {
  await mountInbox();
  api.mockRejectedValueOnce(reject(503));
  fireEvent.click(claimButton());
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Please try again."),
  );
  expect(screen.getByText("Unassigned")).toBeTruthy();
  api.mockResolvedValueOnce(assigned);
  fireEvent.click(claimButton());
  await screen.findByText("Assigned to Sara");
});
it("returns to sign in when the session expired during a claim", async () => {
  await mountInbox();
  api.mockRejectedValueOnce(reject(401));
  fireEvent.click(claimButton());
  await screen.findByRole("heading", { name: "Sign in" });
  expect(screen.getByRole("alert").textContent).toContain(
    "session has expired",
  );
});
it.each(["resolve", "reject"] as const)(
  "ignores a claim %s after leaving the ticket",
  async (outcome) => {
    signedIn({ mobile: true });
    render(<App />);
    fireEvent.click(
      await screen.findByRole("button", { name: /#1 Invoice export/ }),
    );
    await screen.findByRole("heading", { name: ticket.subject });
    const pending = deferred<Ticket>();
    api.mockImplementationOnce(() => pending.promise);
    fireEvent.click(claimButton());
    fireEvent.click(screen.getByRole("button", { name: "Back to inbox" }));
    await act(async () => {
      if (outcome === "resolve") pending.resolve(assigned);
      else pending.reject(reject(409));
    });
    expect(screen.queryByText("Assigned to Sara")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("");
  },
);
it.each([
  ["unassigned", ticket, "Unassigned"],
  ["assigned", assigned, "Assigned to Sara"],
] as const)(
  "lets a customer see the %s ticket but not claim it",
  async (_, shown, text) => {
    api
      .mockResolvedValueOnce({ ...user, id: 3, role: "customer" })
      .mockResolvedValueOnce([shown])
      .mockResolvedValueOnce(shown);
    render(<App />);
    await screen.findByText(text);
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull();
  },
);
