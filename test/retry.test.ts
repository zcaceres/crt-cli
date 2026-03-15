import { describe, expect, test } from "bun:test";
import { CrtShError, fetchWithRetry } from "../src/api";

describe("fetchWithRetry", () => {
  test("retries on 502 up to 3 times, then throws SERVER_ERROR", async () => {
    let callCount = 0;
    const fetchFn = (async () => {
      callCount++;
      return new Response("Bad Gateway", { status: 502 });
    }) as typeof fetch;

    try {
      await fetchWithRetry("https://crt.sh/?q=test&output=json", {
        baseDelay: 0,
        fetchFn,
      });
      throw new Error("should not reach here");
    } catch (err) {
      expect(err).toBeInstanceOf(CrtShError);
      expect((err as CrtShError).code).toBe("SERVER_ERROR");
      expect(callCount).toBe(4); // 1 initial + 3 retries
    }
  });

  test("retries on network error, then throws NETWORK_ERROR", async () => {
    let callCount = 0;
    const fetchFn = (async () => {
      callCount++;
      throw new Error("fetch failed");
    }) as typeof fetch;

    try {
      await fetchWithRetry("https://crt.sh/?q=test&output=json", {
        baseDelay: 0,
        fetchFn,
      });
      throw new Error("should not reach here");
    } catch (err) {
      expect(err).toBeInstanceOf(CrtShError);
      expect((err as CrtShError).code).toBe("NETWORK_ERROR");
      expect(callCount).toBe(4);
    }
  });

  test("succeeds on 2nd attempt after initial 502", async () => {
    let callCount = 0;
    const fetchFn = (async () => {
      callCount++;
      if (callCount === 1) {
        return new Response("Bad Gateway", { status: 502 });
      }
      return new Response("OK", { status: 200 });
    }) as typeof fetch;

    const response = await fetchWithRetry(
      "https://crt.sh/?q=test&output=json",
      { baseDelay: 0, fetchFn },
    );
    expect(response.status).toBe(200);
    expect(callCount).toBe(2);
  });

  test("does NOT retry on 404", async () => {
    let callCount = 0;
    const fetchFn = (async () => {
      callCount++;
      return new Response("Not Found", { status: 404 });
    }) as typeof fetch;

    try {
      await fetchWithRetry("https://crt.sh/?q=test&output=json", {
        baseDelay: 0,
        fetchFn,
      });
      throw new Error("should not reach here");
    } catch (err) {
      expect(err).toBeInstanceOf(CrtShError);
      expect((err as CrtShError).code).toBe("HTTP_ERROR");
      expect(callCount).toBe(1);
    }
  });
});
