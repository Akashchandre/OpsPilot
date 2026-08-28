export function createAuditController(service) {
  return {
    async list(request, response, next) {
      try {
        const result = await service.list({
          actor: request.auth.user,
          query: request.validated.query,
          requestId: request.id,
        });
        response.status(200).json({
          success: true,
          data: { auditEvents: result.events },
          meta: result.meta,
        });
      } catch (error) {
        next(error);
      }
    },
  };
}
