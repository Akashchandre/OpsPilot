export function createJobsController(service) {
  return {
    async list(request, response, next) {
      try {
        const result = await service.list({
          actor: request.auth.user,
          query: request.validated.query,
          requestId: request.id,
        });
        response
          .status(200)
          .json({ success: true, data: { jobs: result.jobs }, meta: result.meta });
      } catch (error) {
        next(error);
      }
    },

    async detail(request, response, next) {
      try {
        const job = await service.detail({
          actor: request.auth.user,
          jobId: request.validated.params.jobId,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { job } });
      } catch (error) {
        next(error);
      }
    },

    async health(request, response, next) {
      try {
        const health = await service.health({
          actor: request.auth.user,
          requestId: request.id,
        });
        response.status(200).json({ success: true, data: { health } });
      } catch (error) {
        next(error);
      }
    },

    async replay(request, response, next) {
      try {
        const result = await service.replay({
          actor: request.auth.user,
          jobId: request.validated.params.jobId,
          idempotencyKey: request.validated.body.idempotencyKey,
          requestId: request.id,
        });
        response
          .status(result.created ? 201 : 200)
          .json({ success: true, data: { job: result.job, replayed: result.created } });
      } catch (error) {
        next(error);
      }
    },
  };
}
