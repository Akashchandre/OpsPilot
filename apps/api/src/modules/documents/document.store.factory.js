import { createEncryptedDocumentStore } from "./document.storage.js";

export async function createConfiguredDocumentStore(config) {
  if (!config.documents.enabled) return null;

  const store = createEncryptedDocumentStore({
    root: config.documents.storage.root,
    activeKeyId: config.documents.encryption.keyId,
    keys: {
      [config.documents.encryption.keyId]: config.documents.encryption.key,
    },
  });
  await store.initialize();
  return store;
}
