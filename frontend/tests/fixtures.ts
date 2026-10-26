import type { Ticket, User } from "../types";
export const user: User = {
  id: 1,
  name: "Sara",
  email: "sara@example.test",
  role: "agent",
};
export const ticket: Ticket = {
  id: 1,
  customer_id: 3,
  subject: "Invoice export",
  customer: "Amina",
  description: "Report missing.",
  priority: "high",
  created_at: "2026-10-22T09:00:00Z",
  assignee_id: null,
  assignee: null,
};
export const claimed: Ticket = { ...ticket, assignee_id: 2, assignee: "Omar" };
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
