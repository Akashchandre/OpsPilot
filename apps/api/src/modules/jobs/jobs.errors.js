import { AppError } from "../../errors/AppError.js";
import { JOB_ERROR_CODES } from "./jobs.constants.js";

const safeErrorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/;

export class JobDescriptorError extends Error {
  constructor(code, message = "The background-job descriptor is invalid") {
    super(message);
    this.name = "JobDescriptorError";
    this.code = code;
  }
}

export class JobExecutionError extends Error {
  constructor(code, { terminal = false } = {}) {
    super("The background job could not be completed");
    this.name = "JobExecutionError";
    this.code = safeErrorCodePattern.test(code) ? code : JOB_ERROR_CODES.HANDLER_FAILED;
    this.terminal = terminal;
  }
}

export function normalizeJobExecutionError(error) {
  if (error instanceof JobExecutionError) return error;
  return new JobExecutionError(JOB_ERROR_CODES.HANDLER_FAILED);
}

export function jobNotFound() {
  return new AppError({
    statusCode: 404,
    code: "JOB_NOT_FOUND",
    message: "Background job was not found",
  });
}

export function jobNotReplayable() {
  return new AppError({
    statusCode: 409,
    code: "JOB_NOT_REPLAYABLE",
    message: "Only a registered dead-letter job can be replayed",
  });
}
