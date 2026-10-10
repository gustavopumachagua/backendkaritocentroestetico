const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildClinicalHistoryIdentityKey,
} = require("./clinicalHistoryIdentity");

test("keeps histories for homonymous patients separate by immutable source id", () => {
  const first = buildClinicalHistoryIdentityKey({
    tratamientoId: "507f1f77bcf86cd799439011",
    patientName: "Ana María López",
  });
  const second = buildClinicalHistoryIdentityKey({
    tratamientoId: "507f1f77bcf86cd799439012",
    patientName: "Ana María López",
  });

  assert.notEqual(first, second);
});

test("does not change an immutable key when the display name is corrected", () => {
  const before = buildClinicalHistoryIdentityKey({
    citaId: "507f1f77bcf86cd799439011",
    patientName: "Ana M. López",
  });
  const after = buildClinicalHistoryIdentityKey({
    citaId: "507f1f77bcf86cd799439011",
    patientName: "Ana María López García",
  });

  assert.equal(before, after);
});
