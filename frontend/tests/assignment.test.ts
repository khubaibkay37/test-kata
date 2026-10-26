import { expect, it } from "vitest";
import { assignmentPanel, type Claim } from "../assignment";
import { claimed, ticket, user } from "./fixtures";

const customer = { ...user, role: "customer" as const };
const idle: Claim = { status: "idle" };

it.each([
  ["unassigned agent", user, ticket, idle, "Unassigned", "claim", ""],
  [
    "claim in flight",
    user,
    ticket,
    { status: "pending" },
    "Unassigned",
    "claiming",
    "",
  ],
  [
    "lost the race",
    user,
    ticket,
    { status: "conflict", message: "Taken." },
    "Unassigned",
    "refresh",
    "Taken.",
  ],
  [
    "failed request",
    user,
    ticket,
    { status: "error", message: "Offline." },
    "Unassigned",
    "claim",
    "Offline.",
  ],
  ["assigned ticket", user, claimed, idle, "Assigned to Omar", null, ""],
  [
    "assignee is the viewer",
    user,
    { ...claimed, assignee: "Sara" },
    idle,
    "Assigned to Sara",
    null,
    "",
  ],
  ["unassigned, customer", customer, ticket, idle, "Unassigned", null, ""],
  ["assigned, customer", customer, claimed, idle, "Assigned to Omar", null, ""],
] as const)("%s", (_, actor, shown, claim, text, action, message) => {
  expect(assignmentPanel(actor, shown, claim)).toEqual({
    text,
    action,
    message,
  });
});
