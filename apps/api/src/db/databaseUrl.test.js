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
      allowPublicKeyRetrieval: true,
    });
  });

  it("does not retrieve authentication keys from a remote database host", () => {
    expect(parseDatabaseUrl("mysql://app:secret@db.internal:3306/opspilot")).toMatchObject({
      host: "db.internal",
      allowPublicKeyRetrieval: false,
    });
  });

  it("rejects incomplete URLs", () => {
    expect(() => parseDatabaseUrl("mysql://127.0.0.1:3306")).toThrow(
      "DATABASE_URL is not a complete MySQL connection URL",
    );
  });
});
