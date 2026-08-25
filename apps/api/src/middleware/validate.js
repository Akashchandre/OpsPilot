import { AppError } from "../errors/AppError.js";

function formatValidationDetails(error, location) {
  return error.issues.map((issue) => ({
    location,
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function validate(schemas) {
  return function validateRequest(request, _response, next) {
    const validated = {};
    const details = [];

    for (const location of ["params", "query", "body"]) {
      const schema = schemas[location];
      if (!schema) continue;

      const result = schema.safeParse(request[location]);
      if (!result.success) {
        details.push(...formatValidationDetails(result.error, location));
      } else {
        validated[location] = result.data;
      }
    }

    if (details.length > 0) {
      return next(
        new AppError({
          statusCode: 422,
          code: "VALIDATION_ERROR",
          message: "The request contains invalid input",
          details,
        }),
      );
    }

    request.validated = validated;
    return next();
  };
}
