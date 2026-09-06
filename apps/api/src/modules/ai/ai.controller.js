export function createAiController(consentService, documentConsentService, aiService) {
  return Object.freeze({
    async getConsent(request, response, next) {
      try {
        const consent = await consentService.get({
          userId: request.auth.user.id,
          assistant: request.validated.params.assistant,
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
          assistant: request.validated.params.assistant,
          requestId: request.id,
        });
        response
          .status(result.changed ? 201 : 200)
          .json({ success: true, data: { consent: result.consent } });
      } catch (error) {
        next(error);
      }
    },

    async revokeConsent(request, response, next) {
      try {
        const result = await consentService.revoke({
          userId: request.auth.user.id,
          assistant: request.validated.params.assistant,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { consent: result.consent } });
      } catch (error) {
        next(error);
      }
    },

    async getDocumentConsent(request, response, next) {
      try {
        const consent = await documentConsentService.get({
          userId: request.auth.user.id,
          assistant: request.validated.params.assistant,
        });
        response.status(200).json({ success: true, data: { consent } });
      } catch (error) {
        next(error);
      }
    },

    async acceptDocumentConsent(request, response, next) {
      try {
        const result = await documentConsentService.accept({
          userId: request.auth.user.id,
          assistant: request.validated.params.assistant,
          requestId: request.id,
        });
        response
          .status(result.changed ? 201 : 200)
          .json({ success: true, data: { consent: result.consent } });
      } catch (error) {
        next(error);
      }
    },

    async revokeDocumentConsent(request, response, next) {
      try {
        const result = await documentConsentService.revoke({
          userId: request.auth.user.id,
          assistant: request.validated.params.assistant,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { consent: result.consent } });
      } catch (error) {
        next(error);
      }
    },

    async customerResponse(request, response, next) {
      try {
        const result = await aiService.customer({
          userId: request.auth.user.id,
          submissionKey: request.idempotencyKey,
          question: request.validated.body.question,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { response: result } });
      } catch (error) {
        next(error);
      }
    },

    async ownerOverviewResponse(request, response, next) {
      try {
        const result = await aiService.owner({
          userId: request.auth.user.id,
          submissionKey: request.idempotencyKey,
          question: request.validated.body.question,
          range: request.validated.body.range,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },

    async customerDocumentResponse(request, response, next) {
      try {
        const result = await aiService.customerDocuments({
          userId: request.auth.user.id,
          submissionKey: request.idempotencyKey,
          question: request.validated.body.question,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { response: result } });
      } catch (error) {
        next(error);
      }
    },

    async ownerDocumentResponse(request, response, next) {
      try {
        const result = await aiService.ownerDocuments({
          userId: request.auth.user.id,
          submissionKey: request.idempotencyKey,
          question: request.validated.body.question,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { response: result } });
      } catch (error) {
        next(error);
      }
    },

    async documentCitation(request, response, next) {
      try {
        const citation = await aiService.citation({
          userId: request.auth.user.id,
          citationId: request.validated.params.citationId,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { citation } });
      } catch (error) {
        next(error);
      }
    },

    async usage(request, response, next) {
      try {
        const usage = await aiService.usage({
          actor: request.auth.user,
          range: request.validated.query,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { usage } });
      } catch (error) {
        next(error);
      }
    },
  });
}
