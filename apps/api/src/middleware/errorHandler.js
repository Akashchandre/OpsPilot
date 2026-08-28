import { AppError } from "../errors/AppError.js";

function normalizeBodyParserError(error) {
  if (error?.type === "entity.too.large") {
    return new AppError({
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "The request payload is too large",
    });
  }
  if (error?.type === "entity.parse.failed") {
    return new AppError({
      statusCode: 400,
      code: "INVALID_JSON",
      message: "The JSON request body is invalid",
    });
  }
  return error;
}

function safeErrorClass(error) {
  const name = error?.constructor?.name;
  return typeof name === "string" && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "Error";
}

export function errorHandler(caughtError, request, response, _next) {
  const error = normalizeBodyParserError(caughtError);
  const statusCode = error.isOperational ? error.statusCode : 500;
  const code = error.isOperational ? error.code : "INTERNAL_SERVER_ERROR";
  const message = error.isOperational ? error.message : "An unexpected error occurred";

  if (!error.isOperational) {
    request.logError = { errorClass: safeErrorClass(error), errorCode: code };
  }

  const payload = {
    success: false,
    error: { code, message },
    requestId: request.id,
  };

  if (error.isOperational && error.details) payload.error.details = error.details;

  response.status(statusCode).json(payload);
}
