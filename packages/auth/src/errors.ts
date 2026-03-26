export class AuthServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(params: { code: string; message: string; statusCode: number }) {
    super(params.message);
    this.name = "AuthServiceError";
    this.code = params.code;
    this.statusCode = params.statusCode;
  }
}

export function isAuthServiceError(error: unknown): error is AuthServiceError {
  return error instanceof AuthServiceError;
}
