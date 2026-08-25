import { useEffect, useState } from "react";
import { assignUserRole, listUsers, removeUserRole, updateUserStatus } from "../api/users.js";

const systemRoles = ["CUSTOMER", "ADMIN", "OWNER"];

export function UsersPage() {
  const [state, setState] = useState({ status: "loading", users: [], meta: null, error: "" });
  const [selectedRoles, setSelectedRoles] = useState({});
  const [mutatingUserId, setMutatingUserId] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    listUsers({ signal: controller.signal })
      .then(({ users, meta }) => setState({ status: "ready", users, meta, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ status: "error", users: [], meta: null, error: error.message });
        }
      });
    return () => controller.abort();
  }, []);

  function replaceUser(updatedUser) {
    setState((current) => ({
      ...current,
      error: "",
      users: current.users.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
    }));
  }

  async function mutate(userId, operation) {
    setMutatingUserId(userId);
    setState((current) => ({ ...current, error: "" }));
    try {
      replaceUser(await operation());
    } catch (error) {
      setState((current) => ({ ...current, error: error.message }));
    } finally {
      setMutatingUserId(null);
    }
  }

  if (state.status === "loading")
    return (
      <p className="route-state" role="status">
        Loading users…
      </p>
    );
  if (state.status === "error" && state.users.length === 0) {
    return (
      <p className="global-alert" role="alert">
        {state.error}
      </p>
    );
  }

  return (
    <section className="admin-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">IDENTITY ADMINISTRATION</p>
          <h1>Users and access</h1>
          <p className="muted">
            Status and role changes take effect on the next protected request.
          </p>
        </div>
        <span className="record-count">{state.meta?.total ?? state.users.length} users</span>
      </div>

      {state.error ? (
        <p className="global-alert" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="user-list">
        {state.users.map((user) => {
          const busy = mutatingUserId === user.id;
          const selectedRole = selectedRoles[user.id] ?? "ADMIN";
          return (
            <article className="user-card" key={user.id}>
              <div className="user-card__identity">
                <div className="avatar" aria-hidden="true">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2>{user.displayName}</h2>
                  <p>{user.email}</p>
                </div>
                <span className={`badge badge--${user.status.toLowerCase()}`}>{user.status}</span>
              </div>

              <div className="role-row" aria-label={`Roles for ${user.displayName}`}>
                {user.roles.map((role) => (
                  <span className="role-chip" key={role}>
                    {role}
                    <button
                      type="button"
                      aria-label={`Remove ${role} from ${user.displayName}`}
                      disabled={busy}
                      onClick={() => mutate(user.id, () => removeUserRole(user.id, role))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {user.roles.length === 0 ? <span className="muted">No roles</span> : null}
              </div>

              <div className="user-card__actions">
                <label>
                  <span>Add role</span>
                  <select
                    value={selectedRole}
                    onChange={(event) =>
                      setSelectedRoles({ ...selectedRoles, [user.id]: event.target.value })
                    }
                  >
                    {systemRoles.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy || user.roles.includes(selectedRole)}
                  onClick={() => mutate(user.id, () => assignUserRole(user.id, selectedRole))}
                >
                  Add role
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    mutate(user.id, () =>
                      updateUserStatus(user.id, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE"),
                    )
                  }
                >
                  {user.status === "ACTIVE" ? "Disable" : "Enable"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
