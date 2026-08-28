import { useCallback, useEffect, useRef, useState } from "react";
import {
  listSupportTickets,
  getSupportTicket,
  addSupportMessage,
  updateSupportTicket,
} from "../api/support.js";
import { listUsers } from "../api/users.js";
import { useAuth } from "../auth/auth-context.js";
import { SupportThread } from "../components/SupportThread.jsx";
import { SupportTicketCard } from "../components/SupportTicketCard.jsx";

const statuses = ["ALL", "OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
const editableStatuses = statuses.slice(1);
const priorities = ["ALL", "LOW", "NORMAL", "HIGH", "URGENT"];
const editablePriorities = priorities.slice(1);
const categories = ["ALL", "GENERAL", "ORDER", "PAYMENT", "PRODUCT", "ACCOUNT"];

export function AdminSupportPage() {
  const auth = useAuth();
  const messageKey = useRef(null);
  const [filters, setFilters] = useState({
    status: "ALL",
    priority: "ALL",
    category: "ALL",
    search: "",
  });
  const [search, setSearch] = useState("");
  const [listState, setListState] = useState({ status: "loading", tickets: [], error: "" });
  const [detailState, setDetailState] = useState({ status: "idle", ticket: null, error: "" });
  const [assignees, setAssignees] = useState([]);
  const [message, setMessage] = useState({ body: "", visibility: "CUSTOMER_VISIBLE" });
  const canManage = auth.hasPermission("support:tickets:manage");

  const loadList = useCallback(async () => {
    setListState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const { tickets } = await listSupportTickets({
        view: "management",
        ...filters,
        limit: 100,
      });
      setListState({ status: "ready", tickets, error: "" });
    } catch (error) {
      setListState({ status: "error", tickets: [], error: error.message });
    }
  }, [filters]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!canManage || !auth.hasPermission("users:read")) return;
    const controller = new AbortController();
    listUsers({ limit: 100, signal: controller.signal })
      .then(({ users }) =>
        setAssignees(
          users.filter(
            (user) =>
              user.status === "ACTIVE" && user.permissions.includes("support:tickets:manage"),
          ),
        ),
      )
      .catch(() => setAssignees([]));
    return () => controller.abort();
  }, [auth, canManage]);

  async function selectTicket(ticketId) {
    setDetailState({ status: "loading", ticket: null, error: "" });
    try {
      const ticket = await getSupportTicket(ticketId, { view: "management" });
      setDetailState({ status: "ready", ticket, error: "" });
    } catch (error) {
      setDetailState({ status: "error", ticket: null, error: error.message });
    }
  }

  async function runMutation(action) {
    setDetailState((current) => ({ ...current, status: "saving", error: "" }));
    try {
      const ticket = await action();
      setDetailState({ status: "ready", ticket, error: "" });
      await loadList();
      return true;
    } catch (error) {
      setDetailState((current) => ({ ...current, status: "ready", error: error.message }));
      return false;
    }
  }

  async function saveManagement(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await runMutation(() =>
      updateSupportTicket(detailState.ticket.id, {
        version: detailState.ticket.version,
        status: String(data.get("status")),
        priority: String(data.get("priority")),
        assigneeId: String(data.get("assigneeId")) || null,
      }),
    );
  }

  async function sendMessage(event) {
    event.preventDefault();
    messageKey.current ??= crypto.randomUUID();
    const succeeded = await runMutation(() =>
      addSupportMessage(detailState.ticket.id, message, messageKey.current),
    );
    if (succeeded) {
      messageKey.current = null;
      setMessage({ body: "", visibility: "CUSTOMER_VISIBLE" });
    }
  }

  function setFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
  }

  const ticket = detailState.ticket;

  return (
    <section className="support-page management-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUPPORT OPERATIONS</p>
          <h1>Support queue</h1>
          <p className="muted">Review customer conversations, assignments, status, and priority.</p>
        </div>
        <button className="button button--quiet" type="button" onClick={loadList}>
          Refresh
        </button>
      </div>

      <form
        className="support-filters support-filters--admin"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter("search", search.trim());
        }}
      >
        <label>
          <span>Search</span>
          <input
            value={search}
            maxLength="160"
            placeholder="Ticket number or subject"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            {statuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Priority</span>
          <select
            value={filters.priority}
            onChange={(event) => setFilter("priority", event.target.value)}
          >
            {priorities.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(event) => setFilter("category", event.target.value)}
          >
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button className="button button--secondary" type="submit">
          Search
        </button>
      </form>

      {listState.error ? (
        <p className="global-alert" role="alert">
          {listState.error}
        </p>
      ) : null}
      <div className="support-admin-layout">
        <div className="support-list">
          {listState.status === "loading" ? <p role="status">Loading support queue...</p> : null}
          {listState.status === "ready" && listState.tickets.length === 0 ? (
            <div className="panel empty-state">
              <h2>No tickets match</h2>
              <p>Change the queue filters or refresh.</p>
            </div>
          ) : null}
          {listState.tickets.map((item) => (
            <SupportTicketCard key={item.id} ticket={item} management onSelect={selectTicket} />
          ))}
        </div>

        <aside className="panel support-admin-detail">
          {detailState.status === "idle" ? (
            <>
              <h2>Select a ticket</h2>
              <p className="muted">Choose a queue item to read its complete support history.</p>
            </>
          ) : null}
          {detailState.status === "loading" ? <p role="status">Loading ticket details...</p> : null}
          {detailState.error ? (
            <p className="global-alert" role="alert">
              {detailState.error}
            </p>
          ) : null}
          {ticket ? (
            <>
              <p className="eyebrow">{ticket.ticketNumber}</p>
              <h2>{ticket.subject}</h2>
              <p className="muted">
                Requested by {ticket.requester.displayName} · Version {ticket.version}
              </p>
              <SupportThread messages={ticket.messages} />

              {canManage && ticket.status !== "CLOSED" ? (
                <>
                  <form className="support-form support-management-form" onSubmit={saveManagement}>
                    <h3>Manage ticket</h3>
                    <div className="form-row">
                      <label>
                        <span>Status</span>
                        <select
                          name="status"
                          defaultValue={ticket.status}
                          key={`status-${ticket.version}`}
                        >
                          {editableStatuses.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Priority</span>
                        <select
                          name="priority"
                          defaultValue={ticket.priority}
                          key={`priority-${ticket.version}`}
                        >
                          {editablePriorities.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      <span>Assignee</span>
                      <select
                        name="assigneeId"
                        defaultValue={ticket.assignee?.id ?? ""}
                        key={`assignee-${ticket.version}`}
                      >
                        <option value="">Unassigned</option>
                        {assignees.map((user) => (
                          <option value={user.id} key={user.id}>
                            {user.displayName}
                          </option>
                        ))}
                        {ticket.assignee &&
                        !assignees.some((user) => user.id === ticket.assignee.id) ? (
                          <option value={ticket.assignee.id}>
                            {ticket.assignee.displayName} (currently assigned)
                          </option>
                        ) : null}
                      </select>
                    </label>
                    <button
                      className="button button--primary"
                      type="submit"
                      disabled={detailState.status === "saving"}
                    >
                      Save ticket
                    </button>
                  </form>

                  <form className="support-form support-management-form" onSubmit={sendMessage}>
                    <h3>Add response</h3>
                    <label>
                      <span>Visibility</span>
                      <select
                        value={message.visibility}
                        onChange={(event) => {
                          messageKey.current = null;
                          setMessage((current) => ({ ...current, visibility: event.target.value }));
                        }}
                      >
                        <option value="CUSTOMER_VISIBLE">Customer-visible reply</option>
                        <option value="INTERNAL">Internal note</option>
                      </select>
                    </label>
                    <label>
                      <span>Message</span>
                      <textarea
                        value={message.body}
                        onChange={(event) => {
                          messageKey.current = null;
                          setMessage((current) => ({ ...current, body: event.target.value }));
                        }}
                        maxLength="4000"
                        rows="5"
                        required
                      />
                    </label>
                    <button
                      className="button button--secondary"
                      type="submit"
                      disabled={detailState.status === "saving"}
                    >
                      Add message
                    </button>
                  </form>
                </>
              ) : null}

              <details className="support-history">
                <summary>Ticket history</summary>
                <ol className="status-history">
                  {ticket.history.map((event) => (
                    <li key={event.id}>
                      <strong>{event.eventType}</strong>
                      <span>{event.reasonCode}</span>
                      <small>{new Date(event.createdAt).toLocaleString()}</small>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
