import { AppError } from "../../errors/AppError.js";

export class InFlightGate {
  #active = 0;

  constructor(maximum) {
    this.maximum = maximum;
  }

  async run(operation) {
    if (this.#active >= this.maximum) {
      throw new AppError({
        statusCode: 429,
        code: "AI_CONCURRENCY_LIMIT_REACHED",
        message: "The AI service is busy; try a new request later",
      });
    }

    this.#active += 1;
    try {
      return await operation();
    } finally {
      this.#active -= 1;
    }
  }
}
