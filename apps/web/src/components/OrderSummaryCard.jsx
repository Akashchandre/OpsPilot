import { Link } from "react-router-dom";
import { Money } from "./Money.jsx";

export function OrderSummaryCard({ order, management = false, onSelect }) {
  const content = (
    <>
      <div>
        <p className="eyebrow">{order.orderNumber}</p>
        <h2>{management ? (order.customer?.displayName ?? "Customer") : "Order"}</h2>
        <p className="muted">
          {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="order-card__state">
        <span className="badge">{order.status}</span>
        <strong>
          <Money amount={order.total} currency={order.currency} />
        </strong>
        <small>{new Date(order.createdAt).toLocaleString()}</small>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        className="panel order-card order-card--button"
        type="button"
        onClick={() => onSelect(order.id)}
      >
        {content}
      </button>
    );
  }
  return (
    <Link className="panel order-card" to={`/orders/${order.id}`}>
      {content}
    </Link>
  );
}
