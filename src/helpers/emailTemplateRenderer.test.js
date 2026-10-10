const test = require("node:test");
const assert = require("node:assert/strict");
const renderEmailTemplate = require("./emailTemplateRenderer");

test("renderEmailTemplate escapes interpolated HTML", () => {
  const html = renderEmailTemplate("resetPassword.html", {
    nombre: '<img src=x onerror="alert(1)">',
    resetLink: "https://example.test/new-password?token=a&next=b",
  });

  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes("token=a&amp;next=b"));
  assert.equal(html.includes('<img src=x onerror="alert(1)">'), false);
});
