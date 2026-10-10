const test = require("node:test");
const assert = require("node:assert/strict");
const { hasAllowedImageSignature } = require("./imageFileValidator");

test("hasAllowedImageSignature accepts JPEG, PNG and WEBP headers only", () => {
  assert.equal(hasAllowedImageSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(
    hasAllowedImageSignature(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    true,
  );
  assert.equal(
    hasAllowedImageSignature(Buffer.from("RIFFxxxxWEBP", "ascii")),
    true,
  );
  assert.equal(hasAllowedImageSignature(Buffer.from("<script>alert(1)</script>")), false);
});
