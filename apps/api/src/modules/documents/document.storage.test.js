import { createHash, randomUUID } from "node:crypto";
import { promises as filesystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DOCUMENT_STORAGE_ERROR_CODES,
  DocumentStorageError,
  createEncryptedDocumentStore,
} from "./document.storage.js";

const temporaryRoots = [];

async function makeFixture(overrides = {}) {
  const base = await filesystem.mkdtemp(path.join(tmpdir(), "opspilot-document-store-"));
  temporaryRoots.push(base);
  const repositoryRoot = path.join(base, "repository");
  const storageRoot = path.join(base, "private-objects");
  const activeKeyId = "documents-test-v1";
  const key = Buffer.alloc(32, 0x31);
  const store = createEncryptedDocumentStore({
    root: storageRoot,
    activeKeyId,
    keys: { [activeKeyId]: key },
    repositoryRoot,
    ...overrides,
  });
  await store.initialize();
  return { base, repositoryRoot, storageRoot, activeKeyId, key, store };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((temporaryRoot) => filesystem.rm(temporaryRoot, { recursive: true, force: true })),
  );
});

describe("EncryptedFilesystemDocumentStore", () => {
  it("writes only authenticated ciphertext and round-trips the exact bytes", async () => {
    const { storageRoot, activeKeyId, store } = await makeFixture();
    const documentVersionId = randomUUID();
    const plaintext = Buffer.from("Private policy text with a unique canary.", "utf8");
    const expectedSha256 = createHash("sha256").update(plaintext).digest("hex");

    const stored = await store.write({ documentVersionId, plaintext });
    const rawObject = await filesystem.readFile(path.join(storageRoot, stored.objectKey));
    const restored = await store.read({
      objectKey: stored.objectKey,
      documentVersionId,
      expectedSha256,
    });

    expect(stored.objectKey).toMatch(/^[0-9a-f-]{36}\.opdoc$/);
    expect(stored.keyId).toBe(activeKeyId);
    expect(rawObject.includes(plaintext)).toBe(false);
    expect(restored.plaintext).toEqual(plaintext);
    expect(restored.keyId).toBe(activeKeyId);
  });

  it("fails closed when ciphertext or expected source metadata changes", async () => {
    const { storageRoot, store } = await makeFixture();
    const documentVersionId = randomUUID();
    const plaintext = Buffer.from("Integrity protected text", "utf8");
    const stored = await store.write({ documentVersionId, plaintext });
    const objectPath = path.join(storageRoot, stored.objectKey);
    const envelope = await filesystem.readFile(objectPath);
    envelope[envelope.length - 17] ^= 0xff;
    await filesystem.writeFile(objectPath, envelope);

    await expect(
      store.read({ objectKey: stored.objectKey, documentVersionId }),
    ).rejects.toMatchObject({ code: DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE });

    const fresh = await store.write({ documentVersionId, plaintext });
    await expect(
      store.read({ objectKey: fresh.objectKey, documentVersionId: randomUUID() }),
    ).rejects.toMatchObject({ code: DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE });
    await expect(
      store.read({
        objectKey: fresh.objectKey,
        documentVersionId,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE });
  });

  it("fails closed when the envelope key is unavailable", async () => {
    const fixture = await makeFixture();
    const documentVersionId = randomUUID();
    const stored = await fixture.store.write({
      documentVersionId,
      plaintext: Buffer.from("Key rotation evidence", "utf8"),
    });
    const reader = createEncryptedDocumentStore({
      root: fixture.storageRoot,
      activeKeyId: "documents-new-v2",
      keys: { "documents-new-v2": Buffer.alloc(32, 0x32) },
      repositoryRoot: fixture.repositoryRoot,
    });
    await reader.initialize();

    await expect(
      reader.read({ objectKey: stored.objectKey, documentVersionId }),
    ).rejects.toMatchObject({ code: DOCUMENT_STORAGE_ERROR_CODES.INTEGRITY_FAILURE });
  });

  it("rejects path-like references before touching the filesystem", async () => {
    const { store } = await makeFixture();

    for (const objectKey of ["../outside", "nested/object.opdoc", "document.txt"]) {
      await expect(store.delete(objectKey)).rejects.toMatchObject({
        code: DOCUMENT_STORAGE_ERROR_CODES.INVALID_REFERENCE,
      });
    }
  });

  it("deletes by opaque key idempotently", async () => {
    const { store } = await makeFixture();
    const stored = await store.write({
      documentVersionId: randomUUID(),
      plaintext: Buffer.from("Delete me", "utf8"),
    });

    await expect(store.delete(stored.objectKey)).resolves.toBe(true);
    await expect(store.delete(stored.objectKey)).resolves.toBe(false);
  });

  it("reports only a coarse storage health state", async () => {
    const { storageRoot, store } = await makeFixture();
    await expect(store.health()).resolves.toBe("ready");

    await filesystem.rm(storageRoot, { recursive: true, force: true });
    await expect(store.health()).resolves.toBe("unavailable");
  });

  it("inventories opaque objects without following unexpected entries", async () => {
    const { storageRoot, store } = await makeFixture();
    const first = await store.write({
      documentVersionId: randomUUID(),
      plaintext: Buffer.from("First object"),
    });
    const second = await store.write({
      documentVersionId: randomUUID(),
      plaintext: Buffer.from("Second object"),
    });
    await filesystem.writeFile(path.join(storageRoot, "unexpected.tmp"), "not an object");
    await filesystem.mkdir(path.join(storageRoot, `${randomUUID()}.opdoc`));

    await expect(store.inventory()).resolves.toEqual({
      objectKeys: [first.objectKey, second.objectKey].sort(),
      unexpectedEntryCount: 2,
    });
  });

  it("rejects broad, repository, repository-descendant, and web-accessible roots", async () => {
    const base = await filesystem.mkdtemp(path.join(tmpdir(), "opspilot-document-root-"));
    temporaryRoots.push(base);
    const repositoryRoot = path.join(base, "repository");
    const configuration = {
      activeKeyId: "documents-test-v1",
      keys: { "documents-test-v1": Buffer.alloc(32, 0x31) },
      repositoryRoot,
    };

    for (const root of [
      base,
      repositoryRoot,
      path.join(repositoryRoot, "private-objects"),
      path.join(repositoryRoot, "apps", "web", "data"),
    ]) {
      expect(() => createEncryptedDocumentStore({ ...configuration, root })).toThrow(
        DocumentStorageError,
      );
    }
  });

  it("requires initialization and exact encryption key length", async () => {
    const base = await filesystem.mkdtemp(path.join(tmpdir(), "opspilot-document-config-"));
    temporaryRoots.push(base);
    const repositoryRoot = path.join(base, "repository");
    const root = path.join(base, "private-objects");

    expect(() =>
      createEncryptedDocumentStore({
        root,
        activeKeyId: "documents-test-v1",
        keys: { "documents-test-v1": Buffer.alloc(31, 0x31) },
        repositoryRoot,
      }),
    ).toThrow(DocumentStorageError);

    const store = createEncryptedDocumentStore({
      root,
      activeKeyId: "documents-test-v1",
      keys: { "documents-test-v1": Buffer.alloc(32, 0x31) },
      repositoryRoot,
    });
    await expect(
      store.write({ documentVersionId: randomUUID(), plaintext: Buffer.from("not ready") }),
    ).rejects.toMatchObject({ code: DOCUMENT_STORAGE_ERROR_CODES.INVALID_CONFIGURATION });
  });
});
