export function Notice({ title, children, tone = "warning", role = "note", className = "" }) {
  return (
    <aside className={`notice notice--${tone}${className ? ` ${className}` : ""}`} role={role}>
      <span className="notice__icon" aria-hidden="true">
        {tone === "success" ? "✓" : tone === "danger" ? "!" : "i"}
      </span>
      <div className="notice__content">
        <strong>{title}</strong>
        {children ? <p>{children}</p> : null}
      </div>
    </aside>
  );
}
