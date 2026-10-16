const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../routes/planAlimentario.routes");
const authJwt = require("../middlewares/authJwt");
const controller = require("./planAlimentario.controller");
const service = require("../services/planAlimentario.service");

test("all plan routes require live JWT, cosmiatra role and per-account rate limiting", () => {
  assert.equal(routes.stack[0].handle, authJwt);
  const roleMiddleware = routes.stack[1].handle;
  for (const rol of ["doctor", "administrador", undefined]) {
    let status;
    roleMiddleware({ user: { rol } }, { status(value) { status = value; return this; }, json() {} }, () => assert.fail("must deny role"));
    assert.equal(status, 403);
  }
  let allowed = false;
  roleMiddleware({ user: { rol: "cosmiatra" } }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
  assert.equal(typeof routes.stack[2].handle, "function");
  assert.deepEqual(routes.stack.filter((layer) => layer.route).map((layer) => [layer.route.path, Object.keys(layer.route.methods)]), [
    ["/seguimientos", ["get"]], ["/:historiaId", ["get"]], ["/:historiaId", ["put"]],
  ]);
});

test("saving sends only a refresh identifier, never food or clinical content in role events", async (t) => {
  const original = service.save;
  t.after(() => { service.save = original; });
  const result = { seguimiento: { id: "history" }, plan: { indicaciones: "Private meal content" } };
  service.save = async (id, body, actor) => {
    assert.equal(id, "history"); assert.equal(body.revision, 0); assert.equal(actor.id, "account"); return result;
  };
  const emitted = [];
  await new Promise((resolve, reject) => controller.guardarPlan({
    params: { historiaId: "history" }, body: { revision: 0 }, user: { id: "account" },
    app: { get() { return { to(room) { assert.equal(room, "role:cosmiatra"); return { emit: (event, payload) => emitted.push({ event, payload }) }; } }; } },
  }, { json(value) { assert.equal(value, result); resolve(); } }, reject));
  assert.deepEqual(emitted, [{ event: "planAlimentarioActualizado", payload: { historiaId: "history" } }]);
});
