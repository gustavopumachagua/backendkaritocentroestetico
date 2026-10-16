const service = require("../services/planAlimentario.service");
const asyncHandler = require("../helpers/asyncHandler");

const listarSeguimientos = asyncHandler(async (req, res) => res.json(await service.list(req.user)));
const obtenerPlan = asyncHandler(async (req, res) => res.json(await service.get(req.params.historiaId, req.user)));
const guardarPlan = asyncHandler(async (req, res) => {
  const result = await service.save(req.params.historiaId, req.body, req.user);
  // The reception feed can refresh without sending any food/clinical content
  // to another professional's socket room.
  req.app.get("io")?.to("role:cosmiatra").emit("planAlimentarioActualizado", { historiaId: req.params.historiaId });
  res.json(result);
});

module.exports = { listarSeguimientos, obtenerPlan, guardarPlan };
