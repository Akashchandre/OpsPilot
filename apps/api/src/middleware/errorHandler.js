export function errorHandler(error, request, response, _next) {
  const statusCode = error.isOperational ? error.statusCode : 500;
  const code = error.isOperational ? error.code : "INTERNAL_SERVER_ERROR";
  const message = error.isOperational ? error.message : "An unexpected error occurred";

  const payload = {
    success: false,
    error: { code, message },
    requestId: request.id,
  };

  if (error.isOperational && error.details) {
    payload.error.details = error.details;
  }

  response.status(statusCode).json(payload);
}
