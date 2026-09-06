function encodedFilename(filename) {
  return encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function createDocumentController(service) {
  return Object.freeze({
    async list(request, response, next) {
      try {
        const result = await service.list(request.validated.query);
        response.status(200).json({
          success: true,
          data: { documents: result.documents },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },

    async get(request, response, next) {
      try {
        const document = await service.get(request.validated.params.documentId);
        response.status(200).json({ success: true, data: { document } });
      } catch (error) {
        next(error);
      }
    },

    async recovery(request, response, next) {
      try {
        const recovery = await service.recovery({
          actor: request.auth.user,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { recovery } });
      } catch (error) {
        next(error);
      }
    },

    async create(request, response, next) {
      try {
        const document = await service.create({
          actor: request.auth.user,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(201).json({ success: true, data: { document } });
      } catch (error) {
        next(error);
      }
    },

    async createVersion(request, response, next) {
      try {
        const version = await service.createVersion({
          actor: request.auth.user,
          documentId: request.validated.params.documentId,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(201).json({ success: true, data: { version } });
      } catch (error) {
        next(error);
      }
    },

    async uploadContent(request, response, next) {
      try {
        const result = await service.uploadContent({
          actor: request.auth.user,
          documentId: request.validated.params.documentId,
          versionId: request.validated.params.versionId,
          rawBytes: request.body,
          contentType: request.get("Content-Type"),
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(202).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },

    async readContent(request, response, next) {
      try {
        const result = await service.readContent({
          actor: request.auth.user,
          documentId: request.validated.params.documentId,
          versionId: request.validated.params.versionId,
          requestId: request.id,
        });
        response.set({
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename(result.filename)}`,
          "Content-Type": `${result.mediaType}; charset=utf-8`,
          "X-Content-Type-Options": "nosniff",
        });
        response.status(200).send(result.bytes);
      } catch (error) {
        next(error);
      }
    },

    async updateStatus(request, response, next) {
      try {
        const document = await service.updateStatus({
          actor: request.auth.user,
          documentId: request.validated.params.documentId,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { document } });
      } catch (error) {
        next(error);
      }
    },

    async requestReindex(request, response, next) {
      try {
        const result = await service.requestReindex({
          actor: request.auth.user,
          documentId: request.validated.params.documentId,
          versionId: request.validated.params.versionId,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(202).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },

    async requestDelete(request, response, next) {
      try {
        const result = await service.requestDelete({
          actor: request.auth.user,
          documentId: request.validated.params.documentId,
          input: request.validated.body,
          idempotencyKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(202).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  });
}
