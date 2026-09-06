import test from "node:test";
import assert from "node:assert/strict";
import { DemoDataService, SupabaseDataService } from "../frontend/js/services/data-service.js";

test("el servicio demo añade familias con cuota pendiente y sin datos personales", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const created = await service.createFamily({ name: "Familia Naranjo", shortName: "Naranjo", members: 2, joinedAt: "2026-09-05", quotaCents: 60000, notes: "" });
  const after = await service.getSnapshot();

  assert.match(created.id, /^fam_demo_/);
  assert.equal(created.contributedCents, 0);
  assert.equal(after.families.length, before.families.length + 1);
  assert.equal(after.community.activeFamilyCount, before.community.activeFamilyCount + 1);
});

test("el servicio demo conserva altas sin modificar los datos fuente", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const expense = await service.createExpense({
    date: "2026-09-05",
    concept: "Reparación ficticia",
    amountCents: 1234,
    category: "Reparaciones",
    provider: "Proveedor Demo",
    paymentSource: "COMMUNITY",
    payers: [],
    notes: ""
  });
  const after = await service.getSnapshot();

  assert.match(expense.id, /^gas_demo_/);
  assert.equal(after.expenses.length, before.expenses.length + 1);
  assert.equal(after.expenses[0].amountCents, 1234);
  assert.equal(after.community.currentBalanceCents, before.community.currentBalanceCents - 1234);
  assert.equal(after.community.yearlyExpensesCents, before.community.yearlyExpensesCents + 1234);
  before.expenses.length = 0;
  assert.ok((await service.getSnapshot()).expenses.length > 0);
});

test("el servicio demo conserva nuevas lecturas acumuladas", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const latest = before.waterReadings[0];
  const created = await service.createWaterReading({ ...latest, date: "2026-09-05", readingM3: 36, previousReadingM3: latest.readingM3 });
  const after = await service.getSnapshot();

  assert.match(created.id, /^lec_demo_/);
  assert.equal(after.waterReadings.length, before.waterReadings.length + 1);
  assert.equal(after.waterReadings.at(-1).previousReadingM3, latest.readingM3);
});

test("el servicio demo registra aportaciones y actualiza los totales", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const familyBefore = before.families.find((family) => family.id === "fam_pino").contributedCents;
  const created = await service.createContribution({ familyId: "fam_pino", date: "2026-09-05", amountCents: 2000, concept: "Aportación mensual" });
  const after = await service.getSnapshot();
  assert.match(created.id, /^apo_demo_/);
  assert.equal(after.families.find((family) => family.id === "fam_pino").contributedCents, familyBefore + 2000);
  assert.equal(after.community.yearlyIncomeCents, before.community.yearlyIncomeCents + 2000);
});

test("el servicio demo configura una única cuota anual activa sin cambiar aportaciones", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  await service.setQuotaPlan({ year: 2027, monthlyAmountCents: 2500, annualAmountCents: 30000, dueThroughMonth: 1 });
  const after = await service.getSnapshot();
  assert.equal(after.quotaPlans.find((plan) => plan.year === 2027).annualAmountCents, 30000);
  assert.deepEqual(after.quotaPlans.filter((plan) => plan.active).map((plan) => plan.year), [2027]);
  assert.ok(after.families.every((family) => family.quotaCents === 30000));
  assert.deepEqual(after.families.map((family) => family.contributedCents), before.families.map((family) => family.contributedCents));
});

test("el servicio demo conserva los ejercicios de cuota ya cerrados", async () => {
  const service = new DemoDataService();
  await assert.rejects(() => service.setQuotaPlan({ year: new Date().getFullYear() - 1, monthlyAmountCents: 2000 }), /ejercicio ya cerrado/);
});

test("el servicio demo versiona la tarifa de agua sin perder el histórico", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  await service.setWaterTariff({ validFrom: "2026-09-05", priceCentsPerM3: 214, notes: "Nueva tarifa ficticia" });
  const after = await service.getSnapshot();
  assert.equal(after.community.waterPriceCentsPerM3, 214);
  assert.equal(after.waterTariffs.find((tariff) => tariff.validFrom === "2026-09-05").priceCentsPerM3, 214);
  assert.ok(after.waterTariffs.length > before.waterTariffs.length);
});

test("el servicio demo liquida el agua y deja la nueva lectura como referencia", async () => {
  const service = new DemoDataService();
  const snapshot = await service.getSnapshot();
  const items = snapshot.families.map((family) => {
    const latest = snapshot.waterReadings.find((reading) => reading.familyId === family.id);
    const previous = snapshot.lastWaterSettlement.settledReadings.find((reading) => reading.familyId === family.id);
    return { familyId: family.id, meterId: latest.meterId, currentReadingM3: latest.readingM3, amountCents: 100, usageM3: latest.readingM3 - previous.readingM3 };
  });
  const created = await service.createWaterSettlement({ periodStart: "2025-12-31", periodEnd: "2026-08-31", items, totalAmountCents: 500 });
  const after = await service.getSnapshot();
  assert.match(created.id, /^liq_demo_/);
  assert.equal(after.lastWaterSettlement.date, "2026-08-31");
  assert.equal(after.waterSettlements.length, snapshot.waterSettlements.length + 1);
});

test("un gasto adelantado por familias no reduce el saldo bancario", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const created = await service.createExpense({ date: "2026-09-05", concept: "Trabajo demo", amountCents: 5000, category: "Reparaciones", provider: "Demo", paymentSource: "FAMILIES", payers: [{ familyId: "fam_roble", amountCents: 3000 }, { familyId: "fam_olivo", amountCents: 2000 }], notes: "" });
  const after = await service.getSnapshot();
  assert.equal(created.payers.length, 2);
  assert.equal(after.community.currentBalanceCents, before.community.currentBalanceCents);
  assert.equal(after.community.yearlyExpensesCents, before.community.yearlyExpensesCents + 5000);
});

test("el servicio demo permite corregir un gasto sin cambiar su identidad", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const original = before.expenses[0];
  const updated = await service.updateExpense({ ...original, amountCents: original.amountCents + 100, concept: "Corrección ficticia" });
  const after = await service.getSnapshot();
  assert.equal(updated.id, original.id);
  assert.equal(after.expenses.find((item) => item.id === original.id).amountCents, original.amountCents + 100);
});

test("el servicio demo permite corregir el reparto de una derrama", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const original = before.assessments[0];
  const updated = await service.updateAssessment({ ...original, totalAmountCents: 9000, allocations: [{ familyId: "fam_roble", amountCents: 9000 }] });
  assert.equal(updated.id, original.id);
  assert.deepEqual(updated.allocations, [{ familyId: "fam_roble", amountCents: 9000 }]);
});

test("una derrama conserva el reparto entre las familias elegidas", async () => {
  const service = new DemoDataService();
  const before = await service.getSnapshot();
  const created = await service.createAssessment({ date: "2026-09-05", concept: "Derrama demo", totalAmountCents: 10000, allocations: [{ familyId: "fam_roble", amountCents: 5000 }, { familyId: "fam_pino", amountCents: 5000 }], notes: "" });
  const after = await service.getSnapshot();
  assert.match(created.id, /^der_demo_/);
  assert.equal(after.assessments.length, before.assessments.length + 1);
  assert.deepEqual(created.allocations.map((item) => item.familyId), ["fam_roble", "fam_pino"]);
});

test("el adaptador Supabase envía RPC con clave pública y sesión, nunca secretos", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-demo",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: "demo" }) };
    }
  });

  await service.createExpense({ date: "2026-09-05", concept: "Gasto demo", amountCents: 950, category: "Otros", provider: "Demo", notes: "" });

  assert.equal(calls[0].url, "https://demo.supabase.co/rest/v1/rpc/create_expense");
  assert.equal(calls[0].options.headers.apikey, "sb_publishable_demo");
  assert.equal(calls[0].options.headers.Authorization, "Bearer jwt-demo");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_spent_at: "2026-09-05",
    p_concept: "Gasto demo",
    p_amount_cents: 950,
    p_category_name: "Otros",
    p_provider: "Demo",
    p_notes: "",
    p_payment_source: "COMMUNITY",
    p_payers: []
  });
});

test("el adaptador Supabase usa RPC protegidas para corregir gastos y derramas", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-demo",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: "demo" }) }; }
  });
  await service.updateExpense({ id: "gasto-1", date: "2026-09-05", concept: "Gasto corregido", amountCents: 1200, category: "Otros", provider: "Demo", notes: "", paymentSource: "COMMUNITY", payers: [] });
  await service.updateAssessment({ id: "derrama-1", date: "2026-09-05", concept: "Derrama corregida", totalAmountCents: 1200, allocations: [{ familyId: "fam-1", amountCents: 1200 }], notes: "" });
  assert.equal(calls[0].url, "https://demo.supabase.co/rest/v1/rpc/update_expense");
  assert.equal(calls[1].url, "https://demo.supabase.co/rest/v1/rpc/update_assessment");
  assert.equal(JSON.parse(calls[1].options.body).p_assessment_id, "derrama-1");
});

test("la conciliación bancaria permite corregir familia, gasto o categoría", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-demo",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ id: "mov-1" }) }; }
  });
  await service.assignBankMovement({ id: "mov-1", categoryName: "Impuestos / tasas", notes: "Revisado" });
  assert.equal(calls[0].url, "https://demo.supabase.co/rest/v1/rpc/assign_bank_movement");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_id: "mov-1",
    p_family_id: null,
    p_expense_id: null,
    p_category_name: "Impuestos / tasas",
    p_notes: "Revisado"
  });
});

test("el servicio demo materializa y corrige una conciliación bancaria", async () => {
  const service = new DemoDataService();
  const row = { date: "2026-09-05", valueDate: null, concept: "Aportación bancaria", amountCents: 3000, balanceCents: 9000, reference: "ABC", fingerprint: "mov_demo_test" };
  const imported = await service.importBankMovements({ source: "extracto.xls", rows: [row] });
  let snapshot = await service.getSnapshot();
  const movement = snapshot.bankMovements.find((item) => item.fingerprint === row.fingerprint);
  await service.assignBankMovement({ id: movement.id, familyId: "fam_roble" });
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.contributions.filter((item) => item.bankMovementId === movement.id).length, 1);
  await service.assignBankMovement({ id: movement.id });
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.contributions.some((item) => item.bankMovementId === movement.id), false);
  assert.equal(snapshot.bankMovements.find((item) => item.id === movement.id).assignmentStatus, "PENDIENTE");
  assert.equal(imported.imported, 1);
});

test("el adaptador Supabase cubre edición, aplicación de reglas y reversión de lotes", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-demo",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ assigned: 2, removed: 3 }) }; }
  });
  await service.updateReconciliationRule({ id: "rule-1", pattern: "IBERDROLA", matchType: "CONTAINS", categoryName: "Electricidad", priority: 10 });
  await service.applyReconciliationRules();
  await service.revertBankImport("batch-1");
  assert.deepEqual(calls.map((call) => call.url.split("/").at(-1)), ["update_reconciliation_rule", "apply_reconciliation_rules", "revert_bank_import"]);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_id: "rule-1", p_pattern: "IBERDROLA", p_match_type: "CONTAINS", p_family_id: null,
    p_category_id: null, p_category_name: "Electricidad", p_priority: 10
  });
  assert.deepEqual(JSON.parse(calls[2].options.body), { p_batch_id: "batch-1" });
});

test("la demo admite varias ofertas dentro de una propuesta", async () => {
  const service = new DemoDataService();
  const proposal = await service.createProposal({ title: "Idea de prueba", description: "Descripción de prueba", date: "2026-09-06", estimatedBudgetCents: null, notes: "" });
  await service.createProposalBudget({ proposalId: proposal.id, provider: "Proveedor A", amountCents: 12000, description: "Opción A", date: "2026-09-06", notes: "" });
  await service.createProposalBudget({ proposalId: proposal.id, provider: "Proveedor B", amountCents: 10000, description: "Opción B", date: "2026-09-06", notes: "" });
  const saved = (await service.getSnapshot()).proposals.find((item) => item.id === proposal.id);
  assert.equal(saved.budgets.length, 2);
  assert.deepEqual(saved.budgets.map((item) => item.amountCents), [10000, 12000]);
});

test("la demo conserva un voto por familia y permite cambiarlo mientras está abierto", async () => {
  const service = new DemoDataService();
  await service.setProposalVotingStatus("prop_demo_1", "ABIERTA");
  await service.castProposalVote("prop_demo_1", "fam_roble", "FAVOR");
  await service.castProposalVote("prop_demo_1", "fam_roble", "ABSTENCION");
  const proposal = (await service.getSnapshot()).proposals.find((item) => item.id === "prop_demo_1");
  assert.equal(proposal.status, "PENDIENTE_VOTACION");
  assert.equal(proposal.voting.votes.length, 1);
  assert.equal(proposal.voting.votes[0].vote, "ABSTENCION");
  await service.setProposalVotingStatus("prop_demo_1", "CERRADA");
  await assert.rejects(() => service.castProposalVote("prop_demo_1", "fam_olivo", "FAVOR"), /no está abierta/i);
});

test("la demo permite preparar y reordenar el orden del día", async () => {
  const service = new DemoDataService();
  const meeting = await service.createMeeting({ date: "2026-11-08", time: "18:00", place: "Zona común", notes: "" });
  const first = await service.createAgendaItem({ meetingId: meeting.id, title: "Primer asunto", description: "", proposalId: null, notes: "" });
  const second = await service.createAgendaItem({ meetingId: meeting.id, title: "Segundo asunto", description: "", proposalId: null, notes: "" });
  await service.reorderAgendaItems(meeting.id, [second.id, first.id]);
  const saved = (await service.getSnapshot()).meetings.find((item) => item.id === meeting.id);
  assert.deepEqual(saved.agenda.map((item) => [item.position, item.title]), [[1, "Segundo asunto"], [2, "Primer asunto"]]);
});

test("Supabase carga propuestas y usa RPC protegidas para propuesta y presupuesto", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-demo",
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => /list_(proposals|meetings)$/.test(url) ? [] : { id: "demo" } }; }
  });
  const snapshot = await service.getSnapshot();
  await service.createProposal({ title: "Idea", description: "Descripción", date: "2026-09-06", estimatedBudgetCents: 10000, notes: "" });
  await service.createProposalBudget({ proposalId: "prop-1", provider: "Proveedor", amountCents: 9500, description: "Oferta", date: "2026-09-06", notes: "" });
  await service.setProposalVotingStatus("prop-1", "ABIERTA");
  await service.castProposalVote("prop-1", "fam-1", "FAVOR");
  assert.deepEqual(snapshot.proposals, []);
  assert.ok(calls.some((call) => call.url.endsWith("/rpc/list_proposals")));
  assert.ok(calls.some((call) => call.url.endsWith("/rpc/create_proposal")));
  assert.ok(calls.some((call) => call.url.endsWith("/rpc/create_proposal_budget")));
  assert.ok(calls.some((call) => call.url.endsWith("/rpc/set_proposal_voting_status")));
  assert.ok(calls.some((call) => call.url.endsWith("/rpc/cast_proposal_vote")));
  assert.ok(calls.some((call) => call.url.endsWith("/rpc/list_meetings")));
});

test("Supabase gestiona reuniones y orden del día solo mediante RPC", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", { getAccessToken: async () => "jwt-demo", fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => true }; } });
  await service.createMeeting({ date: "2026-11-08", time: "18:00", place: "Zona común", notes: "" });
  await service.createAgendaItem({ meetingId: "reu-1", title: "Estado de cuentas", description: "", proposalId: null, notes: "" });
  await service.reorderAgendaItems("reu-1", ["ord-2", "ord-1"]);
  assert.deepEqual(calls.map((call) => call.url.split("/").at(-1)), ["create_meeting", "create_agenda_item", "reorder_agenda_items"]);
  assert.deepEqual(JSON.parse(calls[2].options.body), { p_meeting_id: "reu-1", p_item_ids: ["ord-2", "ord-1"] });
});

test("el adaptador Supabase normaliza el alta de familia para la función SQL", async () => {
  const calls = [];
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-demo",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ id: "fam-demo" }) };
    }
  });
  await service.createFamily({ name: "Familia Naranjo", shortName: "Naranjo", members: 2, joinedAt: "2026-09-05", quotaCents: 60000, notes: "Demo" });
  assert.equal(calls[0].url, "https://demo.supabase.co/rest/v1/rpc/create_family");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_name: "Familia Naranjo",
    p_short_name: "Naranjo",
    p_members: 2,
    p_joined_at: "2026-09-05",
    p_annual_quota_cents: 60000,
    p_notes: "Demo"
  });
});

test("el adaptador conserva el estado HTTP para detectar una sesión revocada", async () => {
  const service = new SupabaseDataService("https://demo.supabase.co", "sb_publishable_demo", {
    getAccessToken: async () => "jwt-revocado",
    fetchImpl: async () => ({ ok: false, status: 403 })
  });
  await assert.rejects(service.getSnapshot(), (error) => error.status === 403);
});
