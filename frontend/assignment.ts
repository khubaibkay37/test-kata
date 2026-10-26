import type { Ticket, User } from "./types";

export type Claim =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

export interface AssignmentPanel {
  text: string;
  action: "claim" | "claiming" | "refresh" | null;
  message: string;
}

// A conflict means our view is stale, so refreshing replaces claiming; any
// other failure leaves the claim available to retry.
const actions = {
  idle: "claim",
  pending: "claiming",
  conflict: "refresh",
  error: "claim",
} as const;

export function assignmentPanel(
  user: User,
  ticket: Ticket,
  claim: Claim,
): AssignmentPanel {
  const assigned = ticket.assignee_id !== null;
  return {
    text: assigned ? `Assigned to ${ticket.assignee}` : "Unassigned",
    action: assigned || user.role !== "agent" ? null : actions[claim.status],
    message: "message" in claim ? claim.message : "",
  };
}
