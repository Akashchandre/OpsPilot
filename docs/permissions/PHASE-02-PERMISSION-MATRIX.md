# Phase 2 Permission Matrix

**Status:** Accepted with Phase 2 on 2026-08-25.

## System permissions

| Code | Meaning |
|---|---|
| `users:read` | List and retrieve Phase 2 identity summaries |
| `users:status:manage` | Enable or disable non-owner accounts subject to owner safeguards |
| `users:roles:manage` | Assign or remove system roles subject to owner safeguards |
| `roles:read` | List system roles and their permissions |
| `permissions:read` | List system permission definitions |

## Default role matrix

| Permission | `OWNER` | `ADMIN` | `CUSTOMER` |
|---|:---:|:---:|:---:|
| `users:read` | Yes | Yes | No |
| `users:status:manage` | Yes | Yes | No |
| `users:roles:manage` | Yes | Yes | No |
| `roles:read` | Yes | Yes | No |
| `permissions:read` | Yes | Yes | No |

Additional service rules apply even when a permission is present:

- Only an owner can assign or remove the `OWNER` role.
- An administrator cannot change the roles or status of an owner.
- The last active owner cannot be disabled and cannot lose the `OWNER` role.
- A customer has no administrative permission by default.
- Unknown permissions are denied.

System permission definitions and role-permission mappings are created by version-controlled migration. Phase 2 does not expose custom-role or custom-permission creation.
