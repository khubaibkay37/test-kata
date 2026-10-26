export interface User {
  id: number;
  name: string;
  email: string;
  role: "agent" | "customer";
}

export interface Ticket {
  id: number;
  customer_id: number;
  subject: string;
  customer: string;
  description: string;
  priority: "high" | "medium" | "low";
  created_at: string;
  assignee_id: number | null;
  assignee: string | null;
}
