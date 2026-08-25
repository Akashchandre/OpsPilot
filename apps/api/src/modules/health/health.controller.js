export function createHealthController(healthService) {
  return async function getHealth(_request, response, next) {
    try {
      const health = await healthService.check();
      response.status(200).json({ success: true, data: health });
    } catch (error) {
      next(error);
    }
  };
}
