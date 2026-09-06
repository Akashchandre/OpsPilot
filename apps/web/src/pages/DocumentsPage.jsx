import { useCallback, useEffect, useState } from "react";
import {
  createDocument,
  createDocumentVersion,
  downloadDocumentContent,
  getDocument,
  getDocumentRecovery,
  listDocuments,
  requestDocumentDeletion,
  requestDocumentReindex,
  updateDocumentStatus,
  uploadDocumentContent,
} from "../api/documents.js";
import { useAuth } from "../auth/auth-context.js";

const MAXIMUM_DOCUMENT_BYTES = 256 * 1024;
const documentStatuses = ["ALL", "ACTIVE", "ARCHIVED", "DELETING", "DELETED"];
const transitionalVersionStatuses = new Set(["QUEUED", "PROCESSING", "STAGED", "DELETING"]);

function fileMetadata(file) {
  if (!file) throw new Error("Choose a UTF-8 .txt or .md file.");
  if (file.size > MAXIMUM_DOCUMENT_BYTES) {
    throw new Error("The document must be no larger than 256 KiB.");
  }
  const lowerName = file.name.toLowerCase();
  const mediaType = lowerName.endsWith(".txt")
    ? "text/plain"
    : lowerName.endsWith(".md")
      ? "text/markdown"
      : null;
  if (!mediaType) throw new Error("Only .txt and .md documents are supported.");
  return { filename: file.name, mediaType, language: "en" };
}

async function uploadFile(documentId, versionId, file) {
  const metadata = fileMetadata(file);
  const arrayBuffer =
    typeof file.arrayBuffer === "function"
      ? await file.arrayBuffer()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => resolve(reader.result), { once: true });
          reader.addEventListener(
            "error",
            () => reject(new Error("The document could not be read.")),
            {
              once: true,
            },
          );
          reader.readAsArrayBuffer(file);
        });
  const bytes = new Uint8Array(arrayBuffer);
  return uploadDocumentContent(documentId, versionId, bytes, metadata.mediaType);
}

function formatBytes(value) {
  if (value === null) return "Not uploaded";
  if (value < 1024) return `${value} bytes`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function AudienceFields({ audiences, onChange, legend = "Audience" }) {
  function toggle(audience) {
    onChange(
      audiences.includes(audience)
        ? audiences.filter((entry) => entry !== audience)
        : [...audiences, audience],
    );
  }

  return (
    <fieldset className="checkbox-fieldset document-audiences">
      <legend>{legend}</legend>
      {[
        ["CUSTOMER", "Customer assistant"],
        ["OWNER", "Owner assistant"],
      ].map(([audience, label]) => (
        <label key={audience}>
          <input
            type="checkbox"
            checked={audiences.includes(audience)}
            onChange={() => toggle(audience)}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function DocumentCreateForm({ busy, onCreate }) {
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [audiences, setAudiences] = useState(["CUSTOMER"]);

  return (
    <form
      className="panel management-form document-create-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const created = await onCreate({ title, file, audiences });
        if (created) {
          setTitle("");
          setFile(null);
          setAudiences(["CUSTOMER"]);
          form.reset();
        }
      }}
    >
      <div>
        <p className="eyebrow">NEW DOCUMENT</p>
        <h2>Create and ingest</h2>
      </div>
      <label>
        <span>Title</span>
        <input
          required
          minLength={1}
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        <span>UTF-8 document</span>
        <input
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <small>Plain text or Markdown, English, maximum 256 KiB.</small>
      </label>
      <AudienceFields audiences={audiences} onChange={setAudiences} />
      <button
        className="button button--primary"
        type="submit"
        disabled={busy || audiences.length === 0}
      >
        {busy ? "Creating..." : "Create and upload"}
      </button>
    </form>
  );
}

function NewVersionForm({ document, busy, onCreate }) {
  const [file, setFile] = useState(null);
  const [audiences, setAudiences] = useState(["CUSTOMER"]);

  return (
    <form
      className="document-version-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const created = await onCreate({ file, audiences });
        if (created) {
          setFile(null);
          setAudiences(["CUSTOMER"]);
          form.reset();
        }
      }}
    >
      <h3>Add immutable version</h3>
      <label>
        <span>Replacement file</span>
        <input
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <AudienceFields audiences={audiences} onChange={setAudiences} />
      <button
        className="button button--secondary"
        type="submit"
        disabled={busy || audiences.length === 0 || document.status === "DELETING"}
      >
        {busy ? "Uploading..." : "Create version and upload"}
      </button>
    </form>
  );
}

function VersionCard({ document, version, canManage, busy, onUpload, onDownload, onReindex }) {
  const [file, setFile] = useState(null);
  const isActive = document.activeVersionId === version.id;
  const canDownload =
    version.byteLength !== null && !["DELETING", "DELETED"].includes(version.status);
  const canReindex =
    canManage && document.status === "ACTIVE" && isActive && version.status === "READY";

  return (
    <article className={`document-version${isActive ? " document-version--active" : ""}`}>
      <div className="document-version__heading">
        <div>
          <span className={`badge badge--${version.status.toLowerCase()}`}>{version.status}</span>
          {isActive ? <span className="badge badge--active">CURRENT SOURCE</span> : null}
        </div>
        <strong>Version {version.versionNumber}</strong>
      </div>
      <dl className="document-version__metadata">
        <div>
          <dt>File</dt>
          <dd>{version.filename}</dd>
        </div>
        <div>
          <dt>Audience</dt>
          <dd>{version.audiences.join(" + ")}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(version.byteLength)}</dd>
        </div>
        <div>
          <dt>Index</dt>
          <dd>
            v{version.indexVersion} · {version.chunkCount ?? 0} chunks
          </dd>
        </div>
      </dl>
      {version.failureCode ? (
        <p className="inline-error" role="alert">
          Ingestion failed safely: {version.failureCode}
        </p>
      ) : null}
      {transitionalVersionStatuses.has(version.status) ? (
        <p className="muted" role="status">
          Background processing is in progress. Refresh to read the latest state.
        </p>
      ) : null}
      <div className="document-version__actions">
        {canDownload ? (
          <button
            className="button button--quiet"
            type="button"
            onClick={onDownload}
            disabled={busy}
          >
            Download original
          </button>
        ) : null}
        {canReindex ? (
          <button
            className="button button--quiet"
            type="button"
            onClick={onReindex}
            disabled={busy}
          >
            Reindex
          </button>
        ) : null}
      </div>
      {canManage && version.status === "AWAITING_UPLOAD" ? (
        <form
          className="document-pending-upload"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const uploaded = await onUpload(file);
            if (uploaded) {
              setFile(null);
              form.reset();
            }
          }}
        >
          <label>
            <span>Upload the reserved {version.filename} content</span>
            <input
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button className="button button--secondary" type="submit" disabled={busy}>
            Upload pending content
          </button>
        </form>
      ) : null}
    </article>
  );
}

export function DocumentsPage() {
  const auth = useAuth();
  const canManage = auth.hasPermission("documents:manage");
  const canDelete = auth.hasPermission("documents:delete");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [listState, setListState] = useState({ status: "loading", documents: [], error: "" });
  const [selectedId, setSelectedId] = useState(null);
  const [detailState, setDetailState] = useState({ status: "idle", document: null, error: "" });
  const [mutation, setMutation] = useState({ key: "", error: "", message: "" });
  const [recovery, setRecovery] = useState({ status: "idle", report: null, error: "" });

  const loadList = useCallback(
    async (signal) => {
      setListState((current) => ({ ...current, status: "loading", error: "" }));
      try {
        const result = await listDocuments({ status: statusFilter, limit: 100, signal });
        setListState({ status: "ready", documents: result.documents, error: "" });
      } catch (error) {
        if (error.name !== "AbortError") {
          setListState((current) => ({ ...current, status: "error", error: error.message }));
        }
      }
    },
    [statusFilter],
  );

  const loadDetail = useCallback(async (documentId, signal) => {
    if (!documentId) {
      setDetailState({ status: "idle", document: null, error: "" });
      return;
    }
    setDetailState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const document = await getDocument(documentId, { signal });
      setDetailState({ status: "ready", document, error: "" });
    } catch (error) {
      if (error.name !== "AbortError") {
        setDetailState({ status: "error", document: null, error: error.message });
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadList(controller.signal);
    return () => controller.abort();
  }, [loadList]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  async function refresh(documentId = selectedId) {
    await Promise.all([loadList(), loadDetail(documentId)]);
  }

  async function runMutation(key, operation, successMessage, documentId = selectedId) {
    setMutation({ key, error: "", message: "" });
    try {
      await operation();
      setMutation({ key: "", error: "", message: successMessage });
      await refresh(documentId);
      return true;
    } catch (error) {
      setMutation({ key: "", error: error.message, message: "" });
      await refresh(documentId);
      return false;
    }
  }

  async function createAndUpload({ title, file, audiences }) {
    let documentId = null;
    setMutation({ key: "create", error: "", message: "" });
    try {
      const metadata = fileMetadata(file);
      const document = await createDocument({ title, ...metadata, audiences });
      documentId = document.id;
      setSelectedId(document.id);
      const [version] = document.versions;
      await uploadFile(document.id, version.id, file);
      setMutation({ key: "", error: "", message: "Document queued for secure ingestion." });
      await refresh(document.id);
      return true;
    } catch (error) {
      setMutation({
        key: "",
        error: documentId
          ? `The document record was created, but content was not queued: ${error.message}`
          : error.message,
        message: "",
      });
      if (documentId) await refresh(documentId);
      return false;
    }
  }

  async function createAndUploadVersion({ file, audiences }) {
    const document = detailState.document;
    return runMutation(
      "new-version",
      async () => {
        const metadata = fileMetadata(file);
        const version = await createDocumentVersion(document.id, {
          ...metadata,
          audiences,
          version: document.version,
        });
        await uploadFile(document.id, version.id, file);
      },
      "Replacement version queued for secure ingestion.",
    );
  }

  async function download(version) {
    setMutation({ key: `download-${version.id}`, error: "", message: "" });
    try {
      const { blob } = await downloadDocumentContent(detailState.document.id, version.id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = version.filename;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setMutation({ key: "", error: "", message: "Protected original downloaded." });
    } catch (error) {
      setMutation({ key: "", error: error.message, message: "" });
    }
  }

  async function scanRecovery() {
    setRecovery((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const report = await getDocumentRecovery();
      setRecovery({ status: "ready", report, error: "" });
    } catch (error) {
      setRecovery({ status: "error", report: null, error: error.message });
    }
  }

  const document = detailState.document;
  return (
    <section className="documents-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">PROTECTED KNOWLEDGE</p>
          <h1>Company documents</h1>
          <p className="muted">
            Upload immutable text versions, monitor secure ingestion, and control which assistant
            audiences may retrieve the current source.
          </p>
        </div>
        <button
          className="button button--quiet"
          type="button"
          onClick={() => refresh()}
          disabled={listState.status === "loading"}
        >
          Refresh
        </button>
      </div>

      {mutation.error ? (
        <p className="global-alert" role="alert">
          {mutation.error}
        </p>
      ) : null}
      {mutation.message ? (
        <p className="success-message" role="status">
          {mutation.message}
        </p>
      ) : null}

      {canManage ? (
        <DocumentCreateForm busy={mutation.key === "create"} onCreate={createAndUpload} />
      ) : null}

      {canDelete ? (
        <section className="panel document-recovery" aria-labelledby="document-recovery-title">
          <div>
            <p className="eyebrow">OWNER RECOVERY</p>
            <h2 id="document-recovery-title">Orphan inventory</h2>
            <p className="muted">
              Compare encrypted objects and vector points with MySQL metadata. This advisory scan
              never deletes or repairs data.
            </p>
          </div>
          <button
            className="button button--quiet"
            type="button"
            onClick={scanRecovery}
            disabled={recovery.status === "loading"}
          >
            {recovery.status === "loading" ? "Scanning..." : "Scan recovery inventory"}
          </button>
          {recovery.error ? (
            <p className="inline-error" role="alert">
              {recovery.error}
            </p>
          ) : null}
          {recovery.report ? (
            <div>
              <p
                className={recovery.report.clean ? "success-message" : "global-alert"}
                role="status"
              >
                {recovery.report.clean
                  ? "No storage or vector anomalies were detected."
                  : "Anomalies require manual review; no automatic action was taken."}
              </p>
              <dl className="document-version__metadata">
                <div>
                  <dt>Orphan objects</dt>
                  <dd>{recovery.report.storage.orphanObjectCount}</dd>
                </div>
                <div>
                  <dt>Missing objects</dt>
                  <dd>{recovery.report.storage.missingObjectCount}</dd>
                </div>
                <div>
                  <dt>Orphan vector points</dt>
                  <dd>{recovery.report.vectorIndex.orphanPointCount}</dd>
                </div>
                <div>
                  <dt>Missing vector versions</dt>
                  <dd>{recovery.report.vectorIndex.missingVersionCount}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="document-filter">
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {documentStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>

      {listState.error ? (
        <p className="inline-error" role="alert">
          {listState.error}
        </p>
      ) : null}
      {listState.status === "loading" && listState.documents.length === 0 ? (
        <p role="status">Loading documents...</p>
      ) : null}

      <div className="documents-layout">
        <div className="document-list" aria-label="Company documents">
          {listState.status === "ready" && listState.documents.length === 0 ? (
            <div className="panel empty-state">
              <h2>No documents match this status</h2>
            </div>
          ) : null}
          {listState.documents.map((entry) => (
            <button
              className={`panel document-row${selectedId === entry.id ? " document-row--selected" : ""}`}
              type="button"
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
            >
              <span>
                <strong>{entry.title}</strong>
                <small>
                  {entry.activeVersion
                    ? `Current version ${entry.activeVersion.versionNumber}`
                    : "No ready version"}
                </small>
              </span>
              <span className={`badge badge--${entry.status.toLowerCase()}`}>{entry.status}</span>
            </button>
          ))}
        </div>

        <aside className="panel document-detail">
          {detailState.status === "idle" ? (
            <p className="muted">Choose a document to inspect its immutable versions.</p>
          ) : null}
          {detailState.status === "loading" ? <p role="status">Loading document...</p> : null}
          {detailState.error ? (
            <p className="inline-error" role="alert">
              {detailState.error}
            </p>
          ) : null}
          {document ? (
            <>
              <div className="document-detail__heading">
                <div>
                  <p className="eyebrow">{document.status}</p>
                  <h2>{document.title}</h2>
                </div>
                <span className="badge">record v{document.version}</span>
              </div>
              {canManage && ["ACTIVE", "ARCHIVED"].includes(document.status) ? (
                <div className="document-lifecycle-actions">
                  <button
                    className="button button--quiet"
                    type="button"
                    disabled={mutation.key !== ""}
                    onClick={() =>
                      runMutation(
                        "status",
                        () =>
                          updateDocumentStatus(
                            document.id,
                            document.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE",
                            document.version,
                          ),
                        document.status === "ACTIVE" ? "Document archived." : "Document restored.",
                      )
                    }
                  >
                    {document.status === "ACTIVE" ? "Archive" : "Restore"}
                  </button>
                  {canDelete ? (
                    <button
                      className="button button--danger"
                      type="button"
                      disabled={mutation.key !== ""}
                      onClick={() => {
                        if (
                          globalThis.confirm(
                            "Delete every stored version, chunk, and vector for this document?",
                          )
                        ) {
                          void runMutation(
                            "delete",
                            () => requestDocumentDeletion(document.id, document.version),
                            "Document deletion queued.",
                          );
                        }
                      }}
                    >
                      Delete document
                    </button>
                  ) : null}
                </div>
              ) : null}

              {canManage && ["ACTIVE", "ARCHIVED"].includes(document.status) ? (
                <NewVersionForm
                  document={document}
                  busy={mutation.key === "new-version"}
                  onCreate={createAndUploadVersion}
                />
              ) : null}

              <section className="document-versions" aria-label="Document versions">
                <h3>Version history</h3>
                {document.versions.map((version) => (
                  <VersionCard
                    document={document}
                    version={version}
                    canManage={canManage}
                    busy={mutation.key !== ""}
                    key={`${version.id}-${version.version}`}
                    onUpload={(file) =>
                      runMutation(
                        `upload-${version.id}`,
                        () => uploadFile(document.id, version.id, file),
                        "Content queued for secure ingestion.",
                      )
                    }
                    onDownload={() => download(version)}
                    onReindex={() =>
                      runMutation(
                        `reindex-${version.id}`,
                        () => requestDocumentReindex(document.id, version.id, version.version),
                        "Reindex job queued.",
                      )
                    }
                  />
                ))}
              </section>
            </>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
