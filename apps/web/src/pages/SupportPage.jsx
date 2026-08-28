import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSupportTickets } from "../api/support.js";
import { SupportTicketCard } from "../components/SupportTicketCard.jsx";

const statuses = ["ALL", "OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
const categories = ["ALL", "GENERAL", "ORDER", "PAYMENT", "PRODUCT", "ACCOUNT"];

export function SupportPage() {
  const [filters, setFilters] = useState({ status: "ALL", category: "ALL", page: 1 });
  const [state, setState] = useState({
    status: "loading",
    tickets: [],
    meta: null,
    error: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    listSupportTickets({ ...filters, signal: controller.signal })
      .then(({ tickets, meta }) => setState({ status: "ready", tickets, meta, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", tickets: [], meta: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, [filters]);

  function setFilter(name, value) {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    setFilters((current) => ({ ...current, [name]: value, page: 1 }));
  }

  function changePage(page) {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    setFilters((current) => ({ ...current, page }));
  }

  return (
    <section className="support-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUSTOMER SUPPORT</p>
          <h1>Your support tickets</h1>
          <p className="muted">Track questions, replies, and resolutions from one place.</p>
        </div>
        <Link className="button button--primary" to="/support/new">
          Create ticket
        </Link>
      </div>

      <div className="support-filters" aria-label="Ticket filters">
        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select
            value={filters.category}
            onChange={(event) => setFilter("category", event.target.value)}
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
      </div>

      {state.status === "loading" ? <p role="status">Loading support tickets...</p> : null}
      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.status === "ready" && state.tickets.length === 0 ? (
        <div className="panel empty-state">
          <h2>No support tickets found</h2>
          <p>Create a ticket when you need help with an account, product, order, or payment.</p>
        </div>
      ) : null}
      <div className="support-list">
        {state.tickets.map((ticket) => (
          <SupportTicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
      {state.meta?.totalPages > 1 ? (
        <nav className="pagination" aria-label="Support ticket pages">
          <button
            className="button button--quiet"
            type="button"
            disabled={filters.page <= 1}
            onClick={() => changePage(filters.page - 1)}
          >
            Previous
          </button>
          <span>
            Page {state.meta.page} of {state.meta.totalPages}
          </span>
          <button
            className="button button--quiet"
            type="button"
            disabled={filters.page >= state.meta.totalPages}
            onClick={() => changePage(filters.page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
