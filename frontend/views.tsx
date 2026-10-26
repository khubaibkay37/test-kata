import { useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { assignmentPanel, type Claim } from "./assignment";
import type { Ticket, User } from "./types";

const priorities = { high: "High", medium: "Medium", low: "Low" };

export function Login({
  message,
  onSignIn,
}: {
  message: string;
  onSignIn: (email: string, password: string) => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSignIn(String(data.get("email")), String(data.get("password")));
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login" aria-label="Sign in" onSubmit={submit}>
        <span className="brand">Desk</span>
        <h1>Sign in</h1>
        <p className="subtitle">Your support inbox, in one place.</p>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
        />
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={1024}
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          </button>
        </div>
        <p className="error" role="alert">
          {error}
        </p>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function Assignment({
  user,
  ticket,
  claim,
  onClaim,
  onRefresh,
}: {
  user: User;
  ticket: Ticket;
  claim: Claim;
  onClaim: () => void;
  onRefresh: () => void;
}) {
  const panel = assignmentPanel(user, ticket, claim);
  return (
    <section className="assignment" aria-label="Assignment">
      <p className="assignee" role="status">
        {panel.text}
      </p>
      {panel.action === "refresh" ? (
        <button className="text-button" type="button" onClick={onRefresh}>
          Refresh assignment
        </button>
      ) : panel.action ? (
        <button
          className="primary"
          type="button"
          disabled={panel.action === "claiming"}
          onClick={onClaim}
        >
          {panel.action === "claiming" ? "Assigning…" : "Assign to me"}
        </button>
      ) : null}
      <p className="error" role="alert">
        {panel.message}
      </p>
    </section>
  );
}

export function TicketDetail({
  user,
  ticket,
  claim,
  onClaim,
  onRefresh,
  onBack,
}: {
  user: User;
  ticket: Ticket;
  claim: Claim;
  onClaim: () => void;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    heading.current!.focus({ preventScroll: true });
  }, [ticket]);
  const created = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ticket.created_at));
  return (
    <>
      <button className="text-button back" type="button" onClick={onBack}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m10 5-7 7 7 7M3 12h18" />
        </svg>
        Back to inbox
      </button>
      <p className="detail-id">#{ticket.id}</p>
      <h2 ref={heading} tabIndex={-1}>
        {ticket.subject}
      </h2>
      <p className="customer">{ticket.customer} · Customer</p>
      <Assignment
        user={user}
        ticket={ticket}
        claim={claim}
        onClaim={onClaim}
        onRefresh={onRefresh}
      />
      <p className="description">{ticket.description}</p>
      <dl className="metadata">
        <dt>Priority</dt>
        <dd>{priorities[ticket.priority]}</dd>
        <dt>Created</dt>
        <dd>{created}</dd>
      </dl>
    </>
  );
}

export type Detail =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; ticket: Ticket };

export function Inbox({
  user,
  tickets,
  selected,
  detail,
  showDetail,
  claim,
  onOpen,
  onClaim,
  onBack,
  onSignOut,
}: {
  user: User;
  tickets: Ticket[];
  selected: number | null;
  detail: Detail;
  showDetail: boolean;
  claim: Claim;
  onOpen: (id: number) => void;
  onClaim: (id: number) => void;
  onBack: () => void;
  onSignOut: () => void;
}) {
  const rows = useRef(new Map<number, HTMLButtonElement>());
  function back() {
    // Reveal the mobile inbox before moving focus into it.
    flushSync(onBack);
    rows.current.get(selected!)!.focus();
  }
  return (
    <>
      <header className="header">
        <span className="brand">Desk</span>
        <div className="account">
          <span>
            {user.name}{" "}
            <span className="account-role">
              · {user.role === "agent" ? "Support agent" : "Customer"}
            </span>
          </span>
          <button
            className="text-button signout"
            type="button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className={`workspace${showDetail ? " has-detail" : ""}`}>
        <section className="inbox" aria-labelledby="inbox-title">
          <div className="inbox-heading">
            <h1 id="inbox-title">Ticket inbox</h1>
            <p className="count">{tickets.length} tickets</p>
          </div>
          <ul className="ticket-list">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  ref={(node) => {
                    if (node) rows.current.set(ticket.id, node);
                    else rows.current.delete(ticket.id);
                  }}
                  className="ticket-row"
                  type="button"
                  data-ticket={ticket.id}
                  aria-current={selected === ticket.id}
                  onClick={() => onOpen(ticket.id)}
                >
                  <span className="ticket-id">#{ticket.id}</span>{" "}
                  <span>
                    <span className="ticket-subject">{ticket.subject}</span>{" "}
                    <span className="ticket-meta">
                      {ticket.customer} · {priorities[ticket.priority]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {tickets.length === 0 ? (
            <p className="empty">
              No tickets yet. New requests will appear here.
            </p>
          ) : null}
        </section>
        <section className="detail" aria-label="Ticket details">
          <div className="detail-inner">
            {detail.status === "ready" ? (
              <TicketDetail
                user={user}
                ticket={detail.ticket}
                claim={claim}
                onClaim={() => onClaim(detail.ticket.id)}
                onRefresh={() => onOpen(detail.ticket.id)}
                onBack={back}
              />
            ) : detail.status === "loading" ? (
              <p className="empty" role="status">
                Loading ticket…
              </p>
            ) : (
              <p className="empty">
                {tickets.length
                  ? "Select a ticket to read its details."
                  : "There are no tickets to open."}
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

export function Feedback({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="feedback">
      <p role="alert">{message}</p>
      <button className="primary retry" type="button" onClick={onRetry}>
        Try again
      </button>
    </main>
  );
}
