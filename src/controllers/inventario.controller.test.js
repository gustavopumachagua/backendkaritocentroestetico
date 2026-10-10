const test = require("node:test");
const assert = require("node:assert/strict");
const inventarioController = require("./inventario.controller");
const inventarioService = require("../services/inventario.service");

function invoke(handler, req) {
  return new Promise((resolve, reject) => {
    handler(
      req,
      {
        json(payload) {
          resolve(payload);
        },
      },
      reject,
    );
  });
}

test("allows reception to read only the service catalogue of another role", async () => {
  const originalObtenerInventario = inventarioService.obtenerInventario;
  let requestedArguments;

  inventarioService.obtenerInventario = async (...args) => {
    requestedArguments = args;
    return [
      {
        _id: "service-id",
        rol: "doctor",
        tipo: "servicio",
        nombre: "consulta",
        stock: 12,
        umbral: 3,
      },
    ];
  };

  try {
    const payload = await invoke(inventarioController.obtenerInventario, {
      params: { rol: "doctor" },
      query: { tipo: "servicio" },
      user: { rol: "cosmiatra" },
    });

    assert.deepEqual(requestedArguments, ["doctor", "servicio"]);
    assert.deepEqual(payload, [
      {
        _id: "service-id",
        rol: "doctor",
        tipo: "servicio",
        nombre: "consulta",
      },
    ]);
  } finally {
    inventarioService.obtenerInventario = originalObtenerInventario;
  }
});

test("does not expose another role's supplies to reception", async () => {
  await assert.rejects(
    invoke(inventarioController.obtenerInventario, {
      params: { rol: "doctor" },
      query: {},
      user: { rol: "cosmiatra" },
    }),
    (error) => error.statusCode === 403,
  );
});
