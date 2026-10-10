const assert = require("node:assert/strict");
const test = require("node:test");
const Tratamiento = require("../models/Tratamiento.model");
const tratamientoRepository = require("./tratamiento.repository");

test("an appointment fallback only authorizes unowned records and names never authorize a read", async (t) => {
  const originalFind = Tratamiento.find;
  t.after(() => { Tratamiento.find = originalFind; });
  let criteria;
  Tratamiento.find = (filter) => {
    criteria = filter;
    return { populate() { return this; }, sort() { return this; }, lean() { return []; } };
  };

  await tratamientoRepository.findByOwnerOrCitas("professional-a", "Nombre Compartido", "doctor", ["appointment-a"]);
  assert.deepEqual(criteria, {
    $or: [
      { rol: "doctor", profesionalId: "professional-a" },
      {
        $and: [
          { $or: [{ profesionalId: { $exists: false } }, { profesionalId: null }] },
          { cita: { $in: ["appointment-a"] } },
        ],
      },
    ],
  });
});

test("service report projects legacy matching identities while excluding clinical notes and images", async (t) => {
  const originalFind = Tratamiento.find;
  t.after(() => { Tratamiento.find = originalFind; });
  let projection;
  Tratamiento.find = () => ({
    select(fields) { projection = fields.split(" "); return this; },
    populate() { return this; },
    sort() { return []; },
  });
  await tratamientoRepository.findForServiceReport();
  assert.ok(projection.includes("pacienteId"));
  assert.ok(projection.includes("pacienteNombresAnteriores"));
  for (const field of ["observacion", "insumos", "imagenes"]) assert.equal(projection.includes(field), false);
});
