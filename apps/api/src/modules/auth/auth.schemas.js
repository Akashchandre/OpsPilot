import { z } from "zod";
import { SYSTEM_ROLES, USER_STATUSES } from "./auth.constants.js";

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

const emailSchema = z
  .email("Enter a valid email address")
  .max(254, "Email must be 254 characters or fewer")
  .transform(normalizeEmail);

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be 128 characters or fewer");

export const registerSchema = z.strictObject({
  displayName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const userIdParamsSchema = z.strictObject({
  userId: z.uuid(),
});

export const userRoleParamsSchema = z.strictObject({
  userId: z.uuid(),
  roleCode: z.enum(Object.values(SYSTEM_ROLES)),
});

export const assignRoleSchema = z.strictObject({
  roleCode: z.enum(Object.values(SYSTEM_ROLES)),
});

export const updateUserStatusSchema = z.strictObject({
  status: z.enum(Object.values(USER_STATUSES)),
});

export const userListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
