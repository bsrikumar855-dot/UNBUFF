export * from "@/types/contract";

/**
 * Normalized API error class representing backend errors.
 * Preserves HTTP status, backend error code, and error message.
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}
