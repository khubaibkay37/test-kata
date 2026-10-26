import { useEffect, useRef, useState } from "react";
import { ApiError, request, signIn } from "./api";
import type { Claim } from "./assignment";
import { Feedback, Inbox, Login, type Detail } from "./views";
import type { Ticket, User } from "./types";

type Screen =
  | { status: "boot" }
  | { status: "login"; message: string }
  | { status: "error"; message: string }
  | { status: "inbox"; user: User; tickets: Ticket[] };

export function App() {
  const [screen, setScreen] = useState<Screen>({ status: "boot" });
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail>({ status: "empty" });
  const [showDetail, setShowDetail] = useState(false);
  const [claim, setClaim] = useState<Claim>({ status: "idle" });
  const revision = useRef(0);

  function fail(error: unknown) {
    revision.current++;
    if (error instanceof ApiError && error.status === 401) {
      setScreen({
        status: "login",
        message: "Your session has expired. Please sign in again.",
      });
    } else {
      setScreen({ status: "error", message: (error as Error).message });
    }
  }

  async function openTicket(id: number) {
    const current = ++revision.current;
    setSelected(id);
    setShowDetail(true);
    setClaim({ status: "idle" });
    setDetail({ status: "loading" });
    try {
      const ticket = await request<Ticket>(`/tickets/${id}`);
      if (current !== revision.current) return;
      setDetail({ status: "ready", ticket });
    } catch (error) {
      if (current === revision.current) fail(error);
    }
  }

  async function claimTicket(id: number) {
    const current = revision.current;
    setClaim({ status: "pending" });
    try {
      const ticket = await request<Ticket>(`/tickets/${id}/assign`, {
        method: "POST",
      });
      if (current !== revision.current) return;
      setClaim({ status: "idle" });
      setDetail({ status: "ready", ticket });
    } catch (error) {
      if (current !== revision.current) return;
      if (error instanceof ApiError && error.status === 401) fail(error);
      else
        setClaim({
          status:
            error instanceof ApiError && error.status === 409
              ? "conflict"
              : "error",
          message: (error as Error).message,
        });
    }
  }

  async function showInbox(user: User) {
    const current = ++revision.current;
    try {
      const allTickets = await request<Ticket[]>("/tickets");
      const tickets =
        user.role === "agent"
          ? allTickets
          : allTickets.filter((ticket) => ticket.customer_id === user.id);
      if (current !== revision.current) return;
      setSelected(null);
      setDetail({ status: "empty" });
      setShowDetail(false);
      setScreen({ status: "inbox", user, tickets });
      if (tickets.length && !matchMedia("(max-width: 700px)").matches)
        await openTicket(tickets[0]!.id);
    } catch (error) {
      if (current === revision.current) fail(error);
    }
  }

  async function start() {
    const current = ++revision.current;
    setScreen({ status: "boot" });
    try {
      const user = await request<User>("/me");
      if (current === revision.current) await showInbox(user);
    } catch (error) {
      if (current !== revision.current) return;
      if (error instanceof ApiError && error.status === 401)
        setScreen({ status: "login", message: "" });
      else fail(error);
    }
  }

  useEffect(() => {
    void start();
    return () => {
      revision.current++;
    };
  }, []);

  async function login(email: string, password: string) {
    const current = ++revision.current;
    const user = await signIn(email, password);
    if (current === revision.current) await showInbox(user);
  }

  async function logout() {
    const current = ++revision.current;
    try {
      await request("/logout", { method: "POST" });
      if (current === revision.current)
        setScreen({ status: "login", message: "" });
    } catch (error) {
      if (current === revision.current) fail(error);
    }
  }

  if (screen.status === "boot")
    return (
      <p className="boot" role="status">
        Opening Desk…
      </p>
    );
  if (screen.status === "login")
    return <Login message={screen.message} onSignIn={login} />;
  if (screen.status === "error")
    return <Feedback message={screen.message} onRetry={start} />;
  return (
    <Inbox
      user={screen.user}
      tickets={screen.tickets}
      selected={selected}
      detail={detail}
      showDetail={showDetail}
      claim={claim}
      onOpen={openTicket}
      onClaim={claimTicket}
      onBack={() => {
        revision.current++;
        setShowDetail(false);
      }}
      onSignOut={logout}
    />
  );
}
