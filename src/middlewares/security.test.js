const test = require("node:test");
const assert = require("node:assert/strict");
const { getAllowedOrigins } = require("./security");

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
};

function restoreEnvironment() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test.after(restoreEnvironment);

test("CORS uses local origins only outside production", () => {
  process.env.NODE_ENV = "development";
  process.env.FRONTEND_URL = "https://app.karito.test/";
  process.env.CORS_ORIGINS = "https://backoffice.karito.test, https://app.karito.test";

  const origins = getAllowedOrigins();

  assert.ok(origins.includes("http://localhost:4173"));
  assert.ok(origins.includes("https://app.karito.test"));
  assert.ok(origins.includes("https://backoffice.karito.test"));
  assert.equal(
    origins.filter((origin) => origin === "https://app.karito.test").length,
    1,
  );
});

test("CORS fails closed to configured origins in production", () => {
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_URL = "https://app.karito.test/";
  process.env.CORS_ORIGINS = "https://backoffice.karito.test";

  const origins = getAllowedOrigins();

  assert.deepEqual(origins.sort(), [
    "https://app.karito.test",
    "https://backoffice.karito.test",
  ]);
});
