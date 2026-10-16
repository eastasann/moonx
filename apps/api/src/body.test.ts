import { describe, expect, test } from "bun:test";
import { checkBodyWithin, JSON_BODY_MAX_BYTES } from "./body";
import { ApiError } from "./errors";

/**
 * A request whose body is a stream this test controls. `released` turns true once
 * nothing holds the body any more: a clone splits the stream in two, and the source is
 * cancelled only after both halves are.
 */
function streamedRequest(signal: AbortSignal) {
  const state = { released: false };
  let push: (bytes: Uint8Array) => void = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (bytes) => controller.enqueue(bytes);
    },
    cancel() {
      state.released = true;
    },
  });
  const request = new Request("http://localhost/api/auth/sign-in/email", {
    method: "POST",
    body,
    signal,
    duplex: "half",
  } as RequestInit);
  return { request, push: (size: number) => push(new Uint8Array(size)), state };
}

describe("checkBodyWithin", () => {
  test("lets go of the whole body when the client disconnects halfway", async () => {
    const abort = new AbortController();
    const { request, push, state } = streamedRequest(abort.signal);
    push(64 * 1024);

    const checked = checkBodyWithin(request, JSON_BODY_MAX_BYTES);
    await Bun.sleep(10);
    abort.abort();

    const error = await checked.catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("BAD_REQUEST");
    await Bun.sleep(10);
    expect(state.released).toBe(true);
  });

  test("lets go of the whole body when the client left before the check began", async () => {
    const abort = new AbortController();
    const { request, push, state } = streamedRequest(abort.signal);
    push(64 * 1024);
    abort.abort();

    const error = await checkBodyWithin(request, JSON_BODY_MAX_BYTES).catch(
      (thrown: unknown) => thrown,
    );
    expect((error as ApiError).code).toBe("BAD_REQUEST");
    await Bun.sleep(10);
    expect(state.released).toBe(true);
  });

  test("lets go of the whole body when it is too large", async () => {
    const { request, push, state } = streamedRequest(
      new AbortController().signal,
    );
    push(JSON_BODY_MAX_BYTES + 1);

    const error = await checkBodyWithin(request, JSON_BODY_MAX_BYTES).catch(
      (thrown: unknown) => thrown,
    );
    expect((error as ApiError).code).toBe("PAYLOAD_TOO_LARGE");
    await Bun.sleep(10);
    expect(state.released).toBe(true);
  });
});
