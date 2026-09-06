import test from "node:test";
import assert from "node:assert/strict";
import { detectBankDuplicates, fingerprintBankMovement, normalizeBankRow, normalizeBankRows } from "../frontend/js/services/bank-import.js";

test("normaliza fechas e importes españoles a un movimiento estable", () => {
  const movement = normalizeBankRow({ Fecha: "05/09/2026", Concepto: " Cuota   Familia Roble ", Importe: "1.234,56 €", Saldo: "5.000,00", Referencia: "ABC-1" });
  assert.deepEqual(movement, {
    date: "2026-09-05", valueDate: null, concept: "Cuota Familia Roble", amountCents: 123456, balanceCents: 500000,
    reference: "ABC-1", source: "generic", fingerprint: movement.fingerprint, rowNumber: null
  });
  assert.match(movement.fingerprint, /^mov_[0-9a-f]+_[0-9a-f]+$/);
});

test("el fingerprint incluye concepto y referencia, no solo fecha e importe", () => {
  const base = { date: "2026-09-05", concept: "Transferencia A", amountCents: 1000, balanceCents: 2000, reference: "A" };
  assert.notEqual(fingerprintBankMovement(base), fingerprintBankMovement({ ...base, concept: "Transferencia B" }));
  assert.notEqual(fingerprintBankMovement(base), fingerprintBankMovement({ ...base, reference: "B" }));
});

test("renombrar el mismo extracto no cambia la huella del movimiento", () => {
  const row = { fecha: "05/09/2026", concepto: "Ingreso demo", importe: "10,00", saldo: "100,00", referencia: "ABC" };
  const first = normalizeBankRow(row, { source: "extracto-agosto.xls" });
  const renamed = normalizeBankRow(row, { source: "copia-extracto.xls" });
  assert.equal(first.fingerprint, renamed.fingerprint);
});

test("detecta un movimiento antiguo aunque su fingerprint incluyera otro nombre de fichero", () => {
  const current = normalizeBankRow({ fecha: "05/09/2026", concepto: "Ingreso demo", importe: "10,00", saldo: "100,00", referencia: "ABC" });
  const legacy = { ...current, fingerprint: "mov_huella_antigua" };
  const [result] = detectBankDuplicates([current], [legacy]);
  assert.equal(result.duplicate, true);
  assert.equal(result.duplicateReason, "existing");
});

test("detecta duplicados existentes y repetidos en el mismo lote", () => {
  const one = normalizeBankRow({ fecha: "2026-09-05", concepto: "Ingreso demo", importe: "10,00" });
  const two = normalizeBankRow({ fecha: "2026-09-06", concepto: "Salida demo", importe: "-3,20" });
  const result = detectBankDuplicates([one, one, two], [one]);
  assert.deepEqual(result.map((item) => [item.duplicate, item.duplicateReason]), [[true, "existing"], [true, "existing"], [false, null]]);
});

test("rechaza filas incompletas y mantiene el resto del lote", () => {
  const result = normalizeBankRows([
    { fecha: "05/09/2026", concepto: "Válida", importe: "10,00" },
    { fecha: "05/09/2026", concepto: "Sin importe" },
    { fecha: "fecha rota", concepto: "Inválida", importe: "1" },
    {}
  ]);
  assert.equal(result.records.length, 1);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.errors.map((error) => error.rowNumber), [2, 3]);
});
