export function createAiWorkflowController(service, consentService) {
  return Object.freeze({
    async getConsent(request, response, next) {
      try {
        const consent = await consentService.get({
          userId: request.auth.user.id,
          assistant: request.validated.params.scope,
        });
        response.status(200).json({ success: true, data: { consent } });
      } catch (error) {
        next(error);
      }
    },
    async acceptConsent(request, response, next) {
      try {
        const result = await consentService.accept({
          userId: request.auth.user.id,
          assistant: request.validated.params.scope,
          requestId: request.id,
        });
        response.status(result.changed ? 201 : 200).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
    async revokeConsent(request, response, next) {
      try {
        const result = await consentService.revoke({
          userId: request.auth.user.id,
          assistant: request.validated.params.scope,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
    async businessBrief(request, response, next) {
      try {
        const result = await service.businessBrief({
          actor: request.auth.user,
          input: request.validated.body,
          submissionKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(result.replayed ? 200 : 202).json({
          success: true,
          data: { run: result.run },
          meta: { idempotencyReplay: result.replayed },
        });
      } catch (error) {
        next(error);
      }
    },
    async supportReply(request, response, next) {
      try {
        const result = await service.supportReply({
          actor: request.auth.user,
          input: request.validated.body,
          submissionKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(result.replayed ? 200 : 202).json({
          success: true,
          data: { run: result.run },
          meta: { idempotencyReplay: result.replayed },
        });
      } catch (error) {
        next(error);
      }
    },
    async list(request, response, next) {
      try {
        const result = await service.list({
          actor: request.auth.user,
          query: request.validated.query,
        });
        response
          .status(200)
          .json({ success: true, data: { runs: result.runs }, meta: result.meta });
      } catch (error) {
        next(error);
      }
    },
    async get(request, response, next) {
      try {
        const run = await service.get({
          actor: request.auth.user,
          workflowRunId: request.validated.params.workflowRunId,
        });
        response.status(200).json({ success: true, data: { run } });
      } catch (error) {
        next(error);
      }
    },
    async decide(request, response, next) {
      try {
        const run = await service.decide({
          actor: request.auth.user,
          workflowRunId: request.validated.params.workflowRunId,
          input: request.validated.body,
          decisionKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(202).json({ success: true, data: { run } });
      } catch (error) {
        next(error);
      }
    },
    async cancel(request, response, next) {
      try {
        const run = await service.cancel({
          actor: request.auth.user,
          workflowRunId: request.validated.params.workflowRunId,
          version: request.validated.body.version,
          decisionKey: request.idempotencyKey,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { run } });
      } catch (error) {
        next(error);
      }
    },
  });
}
