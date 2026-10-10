const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const authJwt = require("./authJwt");
const users = require("../repositories/user.repository");

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("missing, malformed, invalid and expired credentials respond 401", async (t) => {
  const verify = jwt.verify;
  t.after(() => { jwt.verify = verify; });
  jwt.verify = () => { throw Object.assign(new Error("invalid"), { name: "TokenExpiredError" }); };
  for (const authorization of [undefined, "token", "Basic token", "Bearer token extra", "Bearer expired"]) {
    const res = response();
    await authJwt({ headers: { authorization } }, res, () => assert.fail("must reject"));
    assert.equal(res.statusCode, 401);
  }
});

test("suspended accounts respond 403 and successful JWT uses current immutable account identity", async (t) => {
  const originals = { verify: jwt.verify, find: users.findById };
  t.after(() => { jwt.verify = originals.verify; users.findById = originals.find; });
  jwt.verify = () => ({ id: "account", iat: Math.floor(Date.now() / 1000) });
  users.findById = async () => ({ _id: "account", activo: false, rol: "doctor" });
  const denied = response();
  await authJwt({ headers: { authorization: "Bearer token" } }, denied, () => assert.fail("must reject"));
  assert.equal(denied.statusCode, 403);
  users.findById = async () => ({ _id: "account", activo: true, nombre: "Current", rol: "doctor" });
  const req = { headers: { authorization: "Bearer token" } };
  let accepted = false;
  await authJwt(req, response(), () => { accepted = true; });
  assert.equal(accepted, true);
  assert.deepEqual(req.user, { id: "account", nombre: "Current", rol: "doctor" });
});
