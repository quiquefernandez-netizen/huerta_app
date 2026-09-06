import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateAnnualQuotaCents,
  calculateExpectedQuotaCents,
  calculateFamilyAccount,
  calculateWaterCostCents,
  calculateWaterUsage,
  createWaterSettlementPreview,
  formatMoney,
  getContributionStatus,
  splitCentsEvenly,
  sumCents
} from "../frontend/js/domain.js";

test("el dinero se formatea en euros para España", () => {
  assert.equal(formatMoney(123456), "1.234,56 €");
  assert.equal(formatMoney(-85), "−0,85 €");
  assert.throws(() => formatMoney(10.5), TypeError);
});

test("las cuotas distinguen pago completo, parcial, pendiente y excedido", () => {
  assert.deepEqual(getContributionStatus(60000, 60000), { key: "paid", label: "Al corriente", pendingCents: 0 });
  assert.deepEqual(getContributionStatus(60000, 45000), { key: "partial", label: "Pago parcial", pendingCents: 15000 });
  assert.deepEqual(getContributionStatus(60000, 0), { key: "pending", label: "Pendiente", pendingCents: 60000 });
  assert.deepEqual(getContributionStatus(60000, 62000), { key: "exceeded", label: "Aportación extra", pendingCents: 0 });
});

test("la cuota mensual genera el total anual y lo exigible hasta cada mes", () => {
  assert.equal(calculateAnnualQuotaCents(2000), 24000);
  assert.equal(calculateExpectedQuotaCents(2000, 9), 18000);
  assert.throws(() => calculateExpectedQuotaCents(2000, 13), RangeError);
});

test("el consumo de agua se obtiene de dos lecturas acumuladas", () => {
  assert.equal(calculateWaterUsage(35.2, 31.5), 3.7);
  assert.equal(calculateWaterUsage(31.5, 31.5), 0);
});

test("se rechaza una lectura menor que la anterior", () => {
  assert.throws(() => calculateWaterUsage(30, 31.5), RangeError);
});

test("se rechazan lecturas no numéricas", () => {
  assert.throws(() => calculateWaterUsage(Number.NaN, 31.5), TypeError);
});

test("el coste del agua redondea siempre a céntimos enteros", () => {
  assert.equal(calculateWaterCostCents(3.7, 185), 685);
  assert.equal(calculateWaterCostCents(0.333, 185), 62);
});

test("la liquidación de agua parte de la última lectura ya liquidada", () => {
  const preview = createWaterSettlementPreview({
    families: [{ id: "fam_a", name: "Familia A", active: true }, { id: "fam_b", name: "Familia B", active: true }],
    readings: [
      { id: "lec_a", familyId: "fam_a", meterId: "con_a", date: "2026-08-31", readingM3: 35.2 },
      { id: "lec_b", familyId: "fam_b", meterId: "con_b", date: "2026-08-31", readingM3: 48.8 }
    ],
    settledReadings: [
      { familyId: "fam_a", meterId: "con_a", readingM3: 31.5 },
      { familyId: "fam_b", meterId: "con_b", readingM3: 44.1 }
    ],
    priceCentsPerM3: 185
  });
  assert.equal(preview.totalUsageM3, 8.4);
  assert.equal(preview.totalAmountCents, 1555);
  assert.deepEqual(preview.items.map((item) => item.amountCents), [685, 870]);
});

test("no se puede liquidar si falta la lectura anterior de una familia", () => {
  assert.throws(() => createWaterSettlementPreview({
    families: [{ id: "fam_a", name: "Familia A", active: true }],
    readings: [{ id: "lec_a", familyId: "fam_a", meterId: "con_a", date: "2026-08-31", readingM3: 35.2 }],
    settledReadings: [],
    priceCentsPerM3: 185
  }), /última liquidación/);
});

test("las sumas monetarias mantienen enteros", () => {
  const expenses = [{ amountCents: 101 }, { amountCents: 202 }, { amountCents: 303 }];
  assert.equal(sumCents(expenses, (expense) => expense.amountCents), 606);
});

test("una derrama se reparte exactamente aunque sobren céntimos", () => {
  assert.deepEqual(splitCentsEvenly(100, ["fam_a", "fam_b", "fam_c"]), [
    { familyId: "fam_a", amountCents: 34 },
    { familyId: "fam_b", amountCents: 33 },
    { familyId: "fam_c", amountCents: 33 }
  ]);
  assert.throws(() => splitCentsEvenly(100, []), /familia/);
});

test("la cuenta familiar compensa aportaciones y adelantos con todos los cargos", () => {
  const account = calculateFamilyAccount({
    familyId: "fam_a",
    expectedQuotaCents: 18000,
    contributions: [{ familyId: "fam_a", amountCents: 30000 }],
    waterSettlements: [{ items: [{ familyId: "fam_a", amountCents: 4000 }] }],
    assessments: [{ allocations: [{ familyId: "fam_a", amountCents: 5000 }] }],
    expenses: [{ payers: [{ familyId: "fam_a", amountCents: 2000 }] }]
  });
  assert.equal(account.creditsCents, 32000);
  assert.equal(account.quotaCoveredCents, 18000);
  assert.equal(account.extraContributionsCents, 12000);
  assert.equal(account.quotaPendingCents, 0);
  assert.equal(account.chargesCents, 27000);
  assert.equal(account.balanceCents, 5000);
  assert.equal(account.availableCents, 5000);
  assert.equal(account.pendingCents, 0);
});

test("una aportación parcial conserva todo su valor y deja un saldo pendiente", () => {
  const account = calculateFamilyAccount({ familyId: "fam_a", expectedQuotaCents: 18000, contributions: [{ familyId: "fam_a", amountCents: 10000 }] });
  assert.equal(account.contributionsCents, 10000);
  assert.equal(account.quotaCoveredCents, 10000);
  assert.equal(account.extraContributionsCents, 0);
  assert.equal(account.quotaPendingCents, 8000);
  assert.equal(account.balanceCents, -8000);
  assert.equal(account.availableCents, 0);
  assert.equal(account.pendingCents, 8000);
});

test("el agua consume primero el saldo a favor y después aumenta lo pendiente", () => {
  const account = calculateFamilyAccount({
    familyId: "fam_a",
    expectedQuotaCents: 2000,
    contributions: [{ familyId: "fam_a", amountCents: 3000 }],
    waterSettlements: [{ items: [{ familyId: "fam_a", amountCents: 1500 }] }]
  });
  assert.equal(account.creditsCents, 3000);
  assert.equal(account.chargesCents, 3500);
  assert.equal(account.balanceCents, -500);
  assert.equal(account.pendingCents, 500);
});
