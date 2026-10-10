const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("./rateLimit");

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("createRateLimiter blocks requests that exceed its fixed window", () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 2,
    message: "Límite alcanzado",
  });
  const request = { ip: "203.0.113.12" };

  let nextCalls = 0;
  limiter(request, createResponse(), () => {
    nextCalls += 1;
  });
  limiter(request, createResponse(), () => {
    nextCalls += 1;
  });

  const blockedResponse = createResponse();
  limiter(request, blockedResponse, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 2);
  assert.equal(blockedResponse.statusCode, 429);
  assert.deepEqual(blockedResponse.payload, { message: "Límite alcanzado" });
  assert.equal(blockedResponse.headers["RateLimit-Remaining"], "0");
  assert.ok(Number(blockedResponse.headers["Retry-After"]) >= 1);
});
