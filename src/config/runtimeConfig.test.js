const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertProductionHttpsUrl,
  getMissingRequiredVariables,
} = require("./runtimeConfig");

test("getMissingRequiredVariables detects absent or blank settings", () => {
  const original = process.env.TEST_RUNTIME_CONFIG_VALUE;
  delete process.env.TEST_RUNTIME_CONFIG_VALUE;

  assert.deepEqual(
    getMissingRequiredVariables(["TEST_RUNTIME_CONFIG_VALUE"]),
    ["TEST_RUNTIME_CONFIG_VALUE"],
  );

  process.env.TEST_RUNTIME_CONFIG_VALUE = " configured ";
  assert.deepEqual(getMissingRequiredVariables(["TEST_RUNTIME_CONFIG_VALUE"]), []);

  if (original === undefined) {
    delete process.env.TEST_RUNTIME_CONFIG_VALUE;
  } else {
    process.env.TEST_RUNTIME_CONFIG_VALUE = original;
  }
});

test("production origins must use HTTPS", () => {
  assert.doesNotThrow(() =>
    assertProductionHttpsUrl("https://app.karito.test", "FRONTEND_URL"),
  );
  assert.throws(
    () => assertProductionHttpsUrl("http://app.karito.test", "FRONTEND_URL"),
    /HTTPS válida/,
  );
  assert.throws(
    () => assertProductionHttpsUrl("not-a-url", "FRONTEND_URL"),
    /HTTPS válida/,
  );
});
