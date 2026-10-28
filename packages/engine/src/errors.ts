/** A request the engine refuses: wrong state, wrong person, bad input. Routes answer it with `status`. */
export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export const forbidden = (msg = "not your job") => new EngineError("forbidden", msg, 403);
export const conflict = (code: string, msg: string) => new EngineError(code, msg, 409);
export const badRequest = (code: string, msg: string) => new EngineError(code, msg, 400);
