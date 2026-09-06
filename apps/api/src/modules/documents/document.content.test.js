import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CONTENT_ERROR_CODES,
  MAX_DOCUMENT_CONTENT_BYTES,
  validateAndNormalizeDocumentContent,
} from "./document.content.js";

function validate(rawBytes, overrides = {}) {
  return validateAndNormalizeDocumentContent({
    filename: "policy.md",
    mediaType: "text/markdown",
    language: "en",
    rawBytes,
    ...overrides,
  });
}

describe("validateAndNormalizeDocumentContent", () => {
  it("normalizes a BOM, newlines, and Unicode before hashing", () => {
    const rawBytes = Buffer.from("\uFEFF# Cafe\u0301\r\n\rNext\rLine\n", "utf8");
    const expected = Buffer.from("# Café\n\nNext\nLine\n", "utf8");

    const result = validate(rawBytes);

    expect(result).toEqual({
      filename: "policy.md",
      mediaType: "text/markdown",
      language: "en",
      extension: ".md",
      normalizedBytes: expected,
      byteLength: expected.length,
      sha256: createHash("sha256").update(expected).digest("hex"),
    });
  });

  it("accepts only matching plain-text and Markdown declarations", () => {
    expect(
      validate(Buffer.from("Plain text"), {
        filename: "NOTES.TXT",
        mediaType: "text/plain",
      }).extension,
    ).toBe(".txt");

    for (const overrides of [
      { filename: "policy.pdf", mediaType: "application/pdf" },
      { filename: "policy.md", mediaType: "text/plain" },
      { filename: "policy.txt", mediaType: "text/markdown" },
      { filename: "policy", mediaType: "text/plain" },
    ]) {
      expect(() => validate(Buffer.from("content"), overrides)).toThrowError(
        expect.objectContaining({ code: DOCUMENT_CONTENT_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE }),
      );
    }
  });

  it("rejects path-like and unsafe filenames", () => {
    for (const filename of ["../policy.md", "folder/policy.md", "folder\\policy.md", "\u202E.md"])
      expect(() => validate(Buffer.from("content"), { filename })).toThrowError(
        expect.objectContaining({ code: DOCUMENT_CONTENT_ERROR_CODES.INVALID_FILENAME }),
      );
  });

  it("rejects invalid UTF-8, controls, NUL, and bidi overrides", () => {
    const cases = [
      [Buffer.from([0xc3, 0x28]), DOCUMENT_CONTENT_ERROR_CODES.INVALID_UTF8],
      [Buffer.from("before\u0000after"), DOCUMENT_CONTENT_ERROR_CODES.UNSAFE_CONTENT],
      [Buffer.from("before\u0007after"), DOCUMENT_CONTENT_ERROR_CODES.UNSAFE_CONTENT],
      [Buffer.from("before\u202Eafter"), DOCUMENT_CONTENT_ERROR_CODES.UNSAFE_CONTENT],
      [Buffer.from("before\u2066after"), DOCUMENT_CONTENT_ERROR_CODES.UNSAFE_CONTENT],
    ];

    for (const [rawBytes, code] of cases) {
      expect(() => validate(rawBytes)).toThrowError(expect.objectContaining({ code }));
    }
  });

  it("allows tabs and line feeds but rejects empty normalized content", () => {
    expect(validate(Buffer.from("first\tvalue\nsecond")).byteLength).toBeGreaterThan(0);

    for (const content of ["", "   \r\n\t"])
      expect(() => validate(Buffer.from(content))).toThrowError(
        expect.objectContaining({ code: DOCUMENT_CONTENT_ERROR_CODES.EMPTY_CONTENT }),
      );
  });

  it("enforces English and the exact byte ceiling", () => {
    expect(() => validate(Buffer.from("bonjour"), { language: "fr" })).toThrowError(
      expect.objectContaining({ code: DOCUMENT_CONTENT_ERROR_CODES.UNSUPPORTED_LANGUAGE }),
    );
    expect(validate(Buffer.alloc(MAX_DOCUMENT_CONTENT_BYTES, 0x61)).byteLength).toBe(
      MAX_DOCUMENT_CONTENT_BYTES,
    );
    expect(() => validate(Buffer.alloc(MAX_DOCUMENT_CONTENT_BYTES + 1, 0x61))).toThrowError(
      expect.objectContaining({ code: DOCUMENT_CONTENT_ERROR_CODES.CONTENT_TOO_LARGE }),
    );
  });
});
