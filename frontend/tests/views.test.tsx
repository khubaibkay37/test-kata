import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Feedback, Inbox, Login, TicketDetail } from "../views";
import { claimed, ticket, user } from "./fixtures";
import type { Claim } from "../assignment";
import type { Ticket, User } from "../types";

afterEach(cleanup);
const idle: Claim = { status: "idle" };
function detail(
  props: { user?: User; ticket?: Ticket; claim?: Claim } = {},
  handlers = { onClaim: vi.fn(), onRefresh: vi.fn() },
) {
  render(
    <TicketDetail
      user={props.user ?? user}
      ticket={props.ticket ?? ticket}
      claim={props.claim ?? idle}
      onBack={vi.fn()}
      {...handlers}
    />,
  );
  return handlers;
}
it("renders untrusted ticket text safely and formats the date", () => {
  const { container } = render(
    <TicketDetail
      user={user}
      ticket={{
        ...ticket,
        subject: "Export <script>",
        customer: "<img src=x>",
        description: "&<>\"'",
      }}
      claim={idle}
      onClaim={vi.fn()}
      onRefresh={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByRole("heading").textContent).toBe("Export <script>");
  expect(container.querySelector("script, img")).toBeNull();
  expect(screen.getByText("22 Oct 2026")).toBeTruthy();
  expect(container.querySelector(".description")!.textContent).toBe("&<>\"'");
});
it.each([
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
] as const)("renders %s priority", (priority, label) => {
  detail({ ticket: { ...ticket, priority } });
  expect(screen.getByText(label)).toBeTruthy();
});
it("renders safe login feedback", () => {
  const { container } = render(<Login message="<oops>" onSignIn={vi.fn()} />);
  expect(screen.getByRole("alert").textContent).toBe("<oops>");
  expect(container.querySelector("oops")).toBeNull();
});
it("renders the customer role and safe failure messages", () => {
  render(
    <Inbox
      user={{ ...user, role: "customer" }}
      tickets={[]}
      selected={null}
      detail={{ status: "empty" }}
      showDetail={false}
      claim={idle}
      onOpen={vi.fn()}
      onClaim={vi.fn()}
      onBack={vi.fn()}
      onSignOut={vi.fn()}
    />,
  );
  expect(screen.getByText("· Customer")).toBeTruthy();
  render(<Feedback message="<bad>" onRetry={vi.fn()} />);
  expect(screen.getByRole("alert").textContent).toBe("<bad>");
});
it("offers an agent the claim on an unassigned ticket", () => {
  const { onClaim } = detail();
  expect(screen.getByText("Unassigned")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
  expect(onClaim).toHaveBeenCalledTimes(1);
});
it("disables the claim while the request is pending", () => {
  const { onClaim } = detail({ claim: { status: "pending" } });
  const button = screen.getByRole("button", { name: "Assigning…" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(button);
  expect(onClaim).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
});
it("shows the assignee without a claim button once assigned", () => {
  detail({ ticket: claimed });
  expect(screen.getByRole("status").textContent).toBe("Assigned to Omar");
  expect(screen.queryByRole("button", { name: /Assign|Assigning/ })).toBeNull();
});
it.each([
  ["unassigned", ticket, "Unassigned"],
  ["assigned", claimed, "Assigned to Omar"],
] as const)(
  "shows customers the %s ticket without actions",
  (_, shown, text) => {
    detail({ user: { ...user, role: "customer" }, ticket: shown });
    expect(screen.getByRole("status").textContent).toBe(text);
    expect(screen.queryByRole("button", { name: /Assign|Refresh/ })).toBeNull();
  },
);
it("replaces the claim with a refresh action after a conflict", () => {
  const { onClaim, onRefresh } = detail({
    claim: { status: "conflict", message: "Already assigned to Omar." },
  });
  expect(screen.getByRole("alert").textContent).toBe(
    "Already assigned to Omar.",
  );
  expect(screen.queryByRole("button", { name: "Assign to me" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Refresh assignment" }));
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(onClaim).not.toHaveBeenCalled();
});
it("keeps the claim available to retry after a failed request", () => {
  detail({ claim: { status: "error", message: "Please try again." } });
  expect(screen.getByRole("alert").textContent).toBe("Please try again.");
  expect(screen.getByRole("button", { name: "Assign to me" })).toBeTruthy();
});
