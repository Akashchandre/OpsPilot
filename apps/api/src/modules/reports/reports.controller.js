export function createReportsController(service) {
  return {
    async overview(request, response, next) {
      try {
        const overview = await service.overview(request.validated.query);
        response.status(200).json({ success: true, data: { overview } });
      } catch (error) {
        next(error);
      }
    },
  };
}
