import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth.password.js";

describe("password hashing", () => {
  it("uses a one-way Argon2id hash and verifies only the matching password", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    expect(passwordHash).not.toContain(password);
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "different password")).resolves.toBe(false);
  });
});
