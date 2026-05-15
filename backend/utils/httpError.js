export function createHttpError(message, statusCode = 500, detail = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.detail = detail;
  return error;
}
