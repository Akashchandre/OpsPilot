import { describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "./databaseUrl.js";

describe("parseDatabaseUrl", () => {
  it("converts an encoded MySQL URL to adapter configuration", () => {
    expect(parseDatabaseUrl("mysql://app:p%40ss@127.0.0.1:3307/opspilot_dev")).toEqual({
      host: "127.0.0.1",
      port: 3307,
      user: "app",
      password: "p@ss",
      database: "opspilot_dev",
      connectionLimit: 5,
    });
  });

  it("rejects incomplete URLs", () => {
    expect(() => parseDatabaseUrl("mysql://127.0.0.1:3306")).toThrow(
      "DATABASE_URL is not a complete MySQL connection URL",
    );
  });
});
