export function presentDocumentVersion(version) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    status: version.status,
    filename: version.originalFilename,
    mediaType: version.mediaType,
    language: version.language,
    byteLength: version.normalizedByteLength,
    indexVersion: version.indexVersion,
    chunkCount: version.chunkCount,
    failureCode: version.failureCode,
    audiences: (version.audiences ?? []).map((entry) => entry.audience).sort(),
    uploadedAt: version.uploadedAt,
    processingStartedAt: version.processingStartedAt,
    readyAt: version.readyAt,
    supersededAt: version.supersededAt,
    deletedAt: version.deletedAt,
    version: version.version,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt,
  };
}

export function presentDocument(document) {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
    activeVersionId: document.activeVersionId,
    version: document.version,
    deletedAt: document.deletedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ...(document.versions
      ? { versions: document.versions.map((version) => presentDocumentVersion(version)) }
      : {}),
    ...(document.activeVersion
      ? { activeVersion: presentDocumentVersion(document.activeVersion) }
      : {}),
  };
}
