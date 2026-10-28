import { ApiError } from "./errors";

/**
 * The largest body the API reads as JSON on `/api/v1`, and the largest body any
 * `/api/auth/*` request may carry (SDD 7.2「CSRF」, ADR-029). A MB is 1,000,000 bytes,
 * as in design-spec 6.0.8.
 */
export const JSON_BODY_MAX_BYTES = 1_000_000;

const tooLarge = (maxBytes: number) =>
  new ApiError(
    "PAYLOAD_TOO_LARGE",
    `The request body is larger than ${maxBytes} bytes`,
  );

/**
 * Rejects a body whose `Content-Length` already says it is too large, before any of it
 * is read. A body without the header (chunked) is caught by {@link readBodyWithin}.
 *
 * @throws {ApiError} PAYLOAD_TOO_LARGE
 */
export function checkDeclaredLength(request: Request, maxBytes: number): void {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    /^\d+$/.test(declared) &&
    Number(declared) > maxBytes
  ) {
    throw tooLarge(maxBytes);
  }
}

/**
 * Cancels a stream without waiting. A half of a cloned body finishes cancelling only
 * once the other half is cancelled too, so waiting could hang. Every caller has already
 * decided on its error response, so a failed cancel has nothing left to report; left
 * unhandled, its rejection would end the process.
 */
const release = (stream: { cancel(): Promise<void> }) => {
  stream.cancel().catch(() => undefined);
};

const disconnected = () =>
  new ApiError(
    "BAD_REQUEST",
    "The client closed the connection before the body arrived",
  );

/**
 * Reads a whole body, stopping as soon as more than `maxBytes` have arrived, whatever
 * `Content-Length` claimed (SDD 7.2「CSRF」, 8.1 の 413), or as soon as `signal` says the
 * client has gone.
 *
 * @throws {ApiError} PAYLOAD_TOO_LARGE, or BAD_REQUEST when the client disconnects
 */
export async function readBodyWithin(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (body === null) return new Uint8Array();
  if (signal.aborted) throw disconnected();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = body.getReader();
  // In Bun 1.4 a clone of a request whose client disconnects mid-body never ends, so
  // without this a dropped upload would hold its bytes forever.
  const stop = () => release(reader);
  signal.addEventListener("abort", stop, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw disconnected();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        release(reader);
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", stop);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Checks the size of a body another handler will read (Better Auth on `/api/auth/*`):
 * the declared length first, then the bytes of a clone, so the original stays unread
 * for that handler.
 *
 * @throws {ApiError} PAYLOAD_TOO_LARGE, or BAD_REQUEST when the client disconnects
 */
export async function checkBodyWithin(
  request: Request,
  maxBytes: number,
): Promise<void> {
  checkDeclaredLength(request, maxBytes);
  if (request.body === null) return;
  const copy = request.clone();
  try {
    await readBodyWithin(copy.body, maxBytes, request.signal);
  } catch (error) {
    // The source lets go of the bytes only once both halves are cancelled; the
    // original's half would otherwise keep all it buffered while the request lives.
    // Cloning gives the original a new half, so it is read here, after the clone. The
    // copy's half is still unlocked when the read failed before taking a reader.
    if (request.body !== null) release(request.body);
    if (copy.body !== null && !copy.body.locked) release(copy.body);
    throw error;
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Parses a JSON body of at most {@link JSON_BODY_MAX_BYTES}. An empty body is `null`, so
 * a POST or DELETE without a body passes and fails only the endpoints that need one
 * (SDD 7.2: bodyless requests still send `application/json`).
 *
 * @throws {ApiError} PAYLOAD_TOO_LARGE, or BAD_REQUEST when the body is not UTF-8 JSON
 */
export async function parseJsonBody(request: Request): Promise<unknown> {
  checkDeclaredLength(request, JSON_BODY_MAX_BYTES);
  const bytes = await readBodyWithin(
    request.body,
    JSON_BODY_MAX_BYTES,
    request.signal,
  );
  if (bytes.byteLength === 0) return null;
  try {
    return JSON.parse(utf8.decode(bytes));
  } catch {
    throw new ApiError("BAD_REQUEST", "The request body is not valid JSON");
  }
}
