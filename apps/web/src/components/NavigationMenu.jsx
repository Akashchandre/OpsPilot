import { useEffect, useRef, useState } from "react";

export function NavigationMenu({ label, active, children }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function closeFromOutside(event) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeFromKeyboard(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <details
      className={`nav-menu${active ? " nav-menu--active" : ""}`}
      open={open}
      ref={menuRef}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={triggerRef}>
        {label}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="nav-menu__panel" onClick={() => setOpen(false)}>
        {children}
      </div>
    </details>
  );
}
