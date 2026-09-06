import { demoData } from "../data/demo-data.js";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clone = (value) => structuredClone(value);

export class DemoDataService {
  constructor(initialData = demoData) {
    this.data = clone(initialData);
  }

  async getSnapshot() {
    await delay(180);
    return clone(this.data);
  }

  async createFamily(family) {
    await delay(240);
    const created = { ...clone(family), id: `fam_demo_${crypto.randomUUID()}`, active: true, contributedCents: 0 };
    this.data.families.push(created);
    this.data.community.activeFamilyCount += 1;
    return clone(created);
  }

  async createExpense(expense) {
    await delay(240);
    const created = { paymentSource: "COMMUNITY", payers: [], ...clone(expense), id: `gas_demo_${crypto.randomUUID()}` };
    this.data.expenses.unshift(created);
    this.data.community.yearlyExpensesCents += created.amountCents;
    if (created.paymentSource === "COMMUNITY") this.data.community.currentBalanceCents -= created.amountCents;
    const category = this.data.expenseCategories.find((item) => item.name === created.category);
    if (category) category.amountCents += created.amountCents;
    return clone(created);
  }

  async updateExpense(expense) {
    await delay(240);
    const index = this.data.expenses.findIndex((item) => item.id === expense.id);
    if (index < 0) throw new Error("El gasto no existe.");
    const previous = this.data.expenses[index];
    const updated = { paymentSource: "COMMUNITY", payers: [], ...clone(previous), ...clone(expense) };
    this.data.community.yearlyExpensesCents += updated.amountCents - previous.amountCents;
    if (previous.paymentSource === "COMMUNITY") this.data.community.currentBalanceCents += previous.amountCents;
    if (updated.paymentSource === "COMMUNITY") this.data.community.currentBalanceCents -= updated.amountCents;
    const oldCategory = this.data.expenseCategories.find((item) => item.name === previous.category);
    const newCategory = this.data.expenseCategories.find((item) => item.name === updated.category);
    if (oldCategory) oldCategory.amountCents -= previous.amountCents;
    if (newCategory) newCategory.amountCents += updated.amountCents;
    this.data.expenses[index] = updated;
    return clone(updated);
  }

  async createAssessment(assessment) {
    await delay(280);
    const created = { ...clone(assessment), id: `der_demo_${crypto.randomUUID()}`, status: "ACTIVA" };
    this.data.assessments.unshift(created);
    return clone(created);
  }

  async createProposal(proposal) {
    await delay(220);
    const created = { ...clone(proposal), id: `prop_demo_${crypto.randomUUID()}`, status: "IDEA", budgets: [] };
    this.data.proposals = [created, ...(this.data.proposals ?? [])];
    return clone(created);
  }

  async updateProposal(proposal) {
    await delay(220);
    const index = (this.data.proposals ?? []).findIndex((item) => item.id === proposal.id);
    if (index < 0) throw new Error("La propuesta no existe.");
    this.data.proposals[index] = { ...this.data.proposals[index], ...clone(proposal) };
    return clone(this.data.proposals[index]);
  }

  async deleteProposal(id) {
    await delay(180);
    const before = (this.data.proposals ?? []).length;
    this.data.proposals = (this.data.proposals ?? []).filter((item) => item.id !== id);
    if (this.data.proposals.length === before) throw new Error("La propuesta no existe.");
    return true;
  }

  async createProposalBudget(budget) {
    await delay(200);
    const proposal = (this.data.proposals ?? []).find((item) => item.id === budget.proposalId);
    if (!proposal) throw new Error("La propuesta no existe.");
    const created = { ...clone(budget), id: `pre_demo_${crypto.randomUUID()}` };
    proposal.budgets = [...(proposal.budgets ?? []), created].sort((a, b) => a.amountCents - b.amountCents);
    return clone(created);
  }

  async deleteProposalBudget(id) {
    await delay(160);
    for (const proposal of this.data.proposals ?? []) {
      const before = (proposal.budgets ?? []).length;
      proposal.budgets = (proposal.budgets ?? []).filter((item) => item.id !== id);
      if (proposal.budgets.length < before) return true;
    }
    throw new Error("El presupuesto no existe.");
  }

  async updateAssessment(assessment) {
    await delay(280);
    const index = this.data.assessments.findIndex((item) => item.id === assessment.id);
    if (index < 0) throw new Error("La derrama no existe.");
    const updated = { ...clone(this.data.assessments[index]), ...clone(assessment) };
    this.data.assessments[index] = updated;
    return clone(updated);
  }

  async createWaterReading(reading) {
    await delay(240);
    const created = { ...clone(reading), id: `lec_demo_${crypto.randomUUID()}` };
    this.data.waterReadings.push(created);
    return clone(created);
  }

  async updateWaterReading(reading) {
    await delay(240);
    const index = this.data.waterReadings.findIndex((item) => item.id === reading.id);
    if (index < 0) throw new Error("La lectura no existe.");
    this.data.waterReadings[index] = { ...this.data.waterReadings[index], ...clone(reading) };
    return clone(this.data.waterReadings[index]);
  }

  async createContribution(contribution) {
    await delay(240);
    const created = { ...clone(contribution), id: `apo_demo_${crypto.randomUUID()}` };
    this.data.contributions.push(created);
    const family = this.data.families.find((item) => item.id === created.familyId);
    if (family) family.contributedCents += created.amountCents;
    this.data.community.yearlyIncomeCents += created.amountCents;
    this.data.community.currentBalanceCents += created.amountCents;
    return clone(created);
  }

  async setQuotaPlan(plan) {
    await delay(240);
    if (plan.year < new Date().getFullYear()) throw new Error("No se puede modificar una cuota de un ejercicio ya cerrado.");
    const created = { ...clone(plan), id: plan.id ?? `plan_demo_${plan.year}`, active: true };
    this.data.quotaPlans.forEach((item) => { item.active = false; });
    const existingIndex = this.data.quotaPlans.findIndex((item) => item.year === created.year);
    if (existingIndex >= 0) this.data.quotaPlans[existingIndex] = created;
    else this.data.quotaPlans.push(created);
    this.data.families.filter((family) => family.active).forEach((family) => { family.quotaCents = created.annualAmountCents; });
    return clone(created);
  }

  async setWaterTariff(tariff) {
    await delay(240);
    const created = { ...clone(tariff), id: tariff.id ?? `tariff_demo_${tariff.validFrom}`, active: true };
    const existingIndex = this.data.waterTariffs.findIndex((item) => item.validFrom === created.validFrom);
    if (existingIndex >= 0) this.data.waterTariffs[existingIndex] = created;
    else this.data.waterTariffs.push(created);
    this.data.waterTariffs.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
    this.data.community.waterPriceCentsPerM3 = created.priceCentsPerM3;
    return clone(created);
  }

  async createWaterSettlement(settlement) {
    await delay(320);
    const created = { ...clone(settlement), id: `liq_demo_${crypto.randomUUID()}`, status: "EMITIDA" };
    this.data.waterSettlements.push(created);
    this.data.lastWaterSettlement = {
      id: created.id,
      date: created.periodEnd,
      settledReadings: created.items.map((item) => ({ familyId: item.familyId, meterId: item.meterId, readingM3: item.currentReadingM3 }))
    };
    return clone(created);
  }

  async importBankMovements({ source, rows }) {
    await delay(240);
    const known = new Set((this.data.bankMovements ?? []).map((item) => item.fingerprint));
    const imported = [];
    let duplicates = 0;
    for (const row of rows ?? []) {
      if (known.has(row.fingerprint)) { duplicates += 1; continue; }
      const movement = { ...clone(row), id: `mov_demo_${crypto.randomUUID()}`, source, assignmentStatus: "PENDIENTE", familyId: null, expenseId: null };
      known.add(row.fingerprint);
      imported.push(movement);
    }
    const batchId = `batch_demo_${crypto.randomUUID()}`;
    imported.forEach((movement) => { movement.batchId = batchId; });
    this.data.bankMovements = [...imported, ...(this.data.bankMovements ?? [])];
    this.data.bankImportBatches = [{ id: batchId, source, rowCount: (rows ?? []).length, importedCount: imported.length, duplicateCount: duplicates, createdAt: new Date().toISOString() }, ...(this.data.bankImportBatches ?? [])];
    return { batchId, source, rows: (rows ?? []).length, imported: imported.length, duplicates };
  }

  async revertBankImport(batchId) {
    await delay(220);
    const movementIds = new Set((this.data.bankMovements ?? []).filter((item) => item.batchId === batchId).map((item) => item.id));
    const removed = movementIds.size;
    this.data.contributions = (this.data.contributions ?? []).filter((item) => !movementIds.has(item.bankMovementId));
    this.data.expenses = (this.data.expenses ?? []).filter((item) => !movementIds.has(item.bankMovementId) || !item.createdFromBank);
    this.data.bankMovements = (this.data.bankMovements ?? []).filter((item) => item.batchId !== batchId);
    this.data.bankImportBatches = (this.data.bankImportBatches ?? []).filter((item) => item.id !== batchId);
    return { batchId, removed };
  }

  async assignBankMovement({ id, familyId = null, expenseId = null, categoryName = null, notes = "" }) {
    await delay(180);
    const movement = (this.data.bankMovements ?? []).find((item) => item.id === id);
    if (!movement) throw new Error("El movimiento bancario no existe.");
    this.data.contributions = (this.data.contributions ?? []).filter((item) => item.bankMovementId !== id);
    this.data.expenses = (this.data.expenses ?? []).filter((item) => item.bankMovementId !== id || !item.createdFromBank);
    let linkedExpenseId = expenseId;
    if (familyId) {
      this.data.contributions.unshift({ id: `apo_bank_${id}`, familyId, date: movement.date, amountCents: movement.amountCents, concept: movement.concept, bankMovementId: id, createdFromBank: true });
    } else if (categoryName) {
      linkedExpenseId = `gas_bank_${id}`;
      this.data.expenses.unshift({ id: linkedExpenseId, date: movement.date, concept: movement.concept, amountCents: Math.abs(movement.amountCents), category: categoryName, provider: "Extracto bancario", paymentSource: "COMMUNITY", payers: [], notes, bankMovementId: id, createdFromBank: true });
    }
    Object.assign(movement, { familyId, expenseId: linkedExpenseId, categoryName, notes, assignmentStatus: familyId || linkedExpenseId ? "ASIGNADO" : "PENDIENTE" });
    return clone(movement);
  }

  async listReconciliationRules() {
    await delay(120);
    return clone(this.data.reconciliationRules ?? []);
  }

  async createReconciliationRule(rule) {
    await delay(180);
    const created = { ...clone(rule), id: `rule_demo_${crypto.randomUUID()}`, active: true, priority: rule.priority ?? 100 };
    this.data.reconciliationRules = [created, ...(this.data.reconciliationRules ?? [])];
    return clone(created);
  }

  async updateReconciliationRule(rule) {
    await delay(180);
    const index = (this.data.reconciliationRules ?? []).findIndex((item) => item.id === rule.id);
    if (index < 0) throw new Error("La regla no existe.");
    this.data.reconciliationRules[index] = { ...this.data.reconciliationRules[index], ...clone(rule) };
    return clone(this.data.reconciliationRules[index]);
  }

  async applyReconciliationRules() {
    const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let assigned = 0;
    const rules = [...(this.data.reconciliationRules ?? [])].filter((rule) => rule.active).sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
    for (const movement of (this.data.bankMovements ?? []).filter((item) => item.assignmentStatus === "PENDIENTE")) {
      const concept = normalize(movement.concept);
      const rule = rules.find((item) => {
        const pattern = normalize(item.pattern);
        const matches = item.matchType === "EXACT" ? concept === pattern : concept.includes(pattern);
        return matches && ((movement.amountCents > 0 && item.familyId) || (movement.amountCents < 0 && item.categoryName));
      });
      if (!rule) continue;
      await this.assignBankMovement({ id: movement.id, familyId: rule.familyId ?? null, categoryName: rule.categoryName ?? null, notes: "Asignado por regla" });
      assigned += 1;
    }
    return { assigned };
  }

  async setReconciliationRuleActive(id, active) {
    await delay(140);
    const rule = (this.data.reconciliationRules ?? []).find((item) => item.id === id);
    if (!rule) throw new Error("La regla no existe.");
    rule.active = Boolean(active);
    return clone(rule);
  }

  async deleteReconciliationRule(id) {
    await delay(140);
    const before = this.data.reconciliationRules?.length ?? 0;
    this.data.reconciliationRules = (this.data.reconciliationRules ?? []).filter((item) => item.id !== id);
    if (this.data.reconciliationRules.length === before) throw new Error("La regla no existe.");
    return true;
  }
}

export class SupabaseDataService {
  constructor(baseUrl, publishableKey, options = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") throw new Error("La URL de Supabase debe utilizar HTTPS.");
    this.baseUrl = url.href.replace(/\/$/, "");
    this.publishableKey = publishableKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.getAccessToken = options.getAccessToken ?? (() => globalThis.HUERTA_AUTH_SESSION?.getAccessToken?.());
  }

  async rpc(name, parameters = {}) {
    const accessToken = await this.getAccessToken();
    const headers = {
      apikey: this.publishableKey,
      "Content-Type": "application/json"
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const response = await this.fetchImpl(`${this.baseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(parameters)
    });
    if (!response.ok) {
      const error = new Error("No hemos podido guardar o cargar los datos. Comprueba la conexión y vuelve a intentarlo.");
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async getSnapshot() {
    const [snapshot, proposals] = await Promise.all([this.rpc("get_community_snapshot"), this.rpc("list_proposals")]);
    return { ...snapshot, proposals };
  }

  createFamily(family) {
    return this.rpc("create_family", {
      p_name: family.name,
      p_short_name: family.shortName,
      p_members: family.members,
      p_joined_at: family.joinedAt,
      p_annual_quota_cents: family.quotaCents,
      p_notes: family.notes
    });
  }

  createExpense(expense) {
    return this.rpc("create_expense", {
      p_spent_at: expense.date,
      p_concept: expense.concept,
      p_amount_cents: expense.amountCents,
      p_category_name: expense.category,
      p_provider: expense.provider,
      p_notes: expense.notes,
      p_payment_source: expense.paymentSource ?? "COMMUNITY",
      p_payers: expense.payers ?? []
    });
  }

  updateExpense(expense) {
    return this.rpc("update_expense", {
      p_expense_id: expense.id,
      p_spent_at: expense.date,
      p_concept: expense.concept,
      p_amount_cents: expense.amountCents,
      p_category_name: expense.category,
      p_provider: expense.provider,
      p_notes: expense.notes,
      p_payment_source: expense.paymentSource ?? "COMMUNITY",
      p_payers: expense.payers ?? []
    });
  }

  createAssessment(assessment) {
    return this.rpc("create_assessment", {
      p_concept: assessment.concept,
      p_assessed_at: assessment.date,
      p_total_amount_cents: assessment.totalAmountCents,
      p_allocations: assessment.allocations,
      p_notes: assessment.notes
    });
  }

  updateAssessment(assessment) {
    return this.rpc("update_assessment", {
      p_assessment_id: assessment.id,
      p_concept: assessment.concept,
      p_assessed_at: assessment.date,
      p_total_amount_cents: assessment.totalAmountCents,
      p_allocations: assessment.allocations,
      p_notes: assessment.notes
    });
  }

  createWaterReading(reading) {
    return this.rpc("create_water_reading", {
      p_family_id: reading.familyId,
      p_meter_id: reading.meterId,
      p_read_at: reading.date,
      p_reading_m3: reading.readingM3,
      p_observations: reading.observations ?? ""
    });
  }

  updateWaterReading(reading) {
    return this.rpc("update_water_reading", {
      p_reading_id: reading.id,
      p_read_at: reading.date,
      p_reading_m3: reading.readingM3,
      p_observations: reading.observations ?? ""
    });
  }

  createContribution(contribution) {
    return this.rpc("create_contribution", {
      p_family_id: contribution.familyId,
      p_received_at: contribution.date,
      p_amount_cents: contribution.amountCents,
      p_concept: contribution.concept
    });
  }

  setQuotaPlan(plan) {
    return this.rpc("set_quota_plan", {
      p_year: plan.year,
      p_monthly_amount_cents: plan.monthlyAmountCents
    });
  }

  setWaterTariff(tariff) {
    return this.rpc("set_water_tariff", {
      p_valid_from: tariff.validFrom,
      p_price_cents_m3: tariff.priceCentsPerM3,
      p_notes: tariff.notes ?? ""
    });
  }

  createWaterSettlement(settlement) {
    return this.rpc("create_water_settlement", {
      p_period_start: settlement.periodStart,
      p_period_end: settlement.periodEnd
    });
  }

  importBankMovements({ source, rows }) {
    return this.rpc("import_bank_movements", { p_source: source, p_rows: rows });
  }

  revertBankImport(batchId) { return this.rpc("revert_bank_import", { p_batch_id: batchId }); }

  assignBankMovement({ id, familyId = null, expenseId = null, categoryName = null, notes = "" }) {
    return this.rpc("assign_bank_movement", { p_id: id, p_family_id: familyId, p_expense_id: expenseId, p_category_name: categoryName, p_notes: notes });
  }

  listReconciliationRules() { return this.rpc("list_reconciliation_rules"); }

  createReconciliationRule(rule) {
    return this.rpc("create_reconciliation_rule", {
      p_pattern: rule.pattern,
      p_match_type: rule.matchType ?? "CONTAINS",
      p_family_id: rule.familyId ?? null,
      p_category_id: rule.categoryId ?? null,
      p_category_name: rule.categoryName ?? null,
      p_priority: rule.priority ?? 100,
      p_notes: rule.notes ?? null
    });
  }

  updateReconciliationRule(rule) {
    return this.rpc("update_reconciliation_rule", {
      p_id: rule.id,
      p_pattern: rule.pattern,
      p_match_type: rule.matchType ?? "CONTAINS",
      p_family_id: rule.familyId ?? null,
      p_category_id: rule.categoryId ?? null,
      p_category_name: rule.categoryName ?? null,
      p_priority: rule.priority ?? 100
    });
  }

  applyReconciliationRules() { return this.rpc("apply_reconciliation_rules"); }

  setReconciliationRuleActive(id, active) {
    return this.rpc("set_reconciliation_rule_active", { p_id: id, p_active: active });
  }

  deleteReconciliationRule(id) {
    return this.rpc("delete_reconciliation_rule", { p_id: id });
  }

  createProposal(proposal) {
    return this.rpc("create_proposal", { p_title: proposal.title, p_description: proposal.description, p_proposed_on: proposal.date, p_estimated_budget_cents: proposal.estimatedBudgetCents, p_notes: proposal.notes ?? "" });
  }

  updateProposal(proposal) {
    return this.rpc("update_proposal", { p_id: proposal.id, p_title: proposal.title, p_description: proposal.description, p_proposed_on: proposal.date, p_estimated_budget_cents: proposal.estimatedBudgetCents, p_status: proposal.status, p_notes: proposal.notes ?? "" });
  }

  deleteProposal(id) { return this.rpc("delete_proposal", { p_id: id }); }

  createProposalBudget(budget) {
    return this.rpc("create_proposal_budget", { p_proposal_id: budget.proposalId, p_provider: budget.provider, p_amount_cents: budget.amountCents, p_description: budget.description ?? "", p_quoted_on: budget.date, p_notes: budget.notes ?? "" });
  }

  deleteProposalBudget(id) { return this.rpc("delete_proposal_budget", { p_id: id }); }
}

export function createDataService(config = globalThis.APP_CONFIG) {
  if (config?.dataSource === "supabase" && config?.supabaseUrl && config?.supabasePublishableKey) {
    return new SupabaseDataService(config.supabaseUrl, config.supabasePublishableKey);
  }
  return new DemoDataService();
}
