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

  refreshNextMeeting() {
    const next = [...(this.data.meetings ?? [])].filter((meeting) => meeting.status === "PLANIFICADA" && meeting.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
    this.data.community.nextMeeting = next ? { day: Number(next.date.slice(8, 10)), month: new Intl.DateTimeFormat("es-ES", { month: "long" }).format(new Date(`${next.date}T12:00:00`)), time: next.time, place: next.place } : { day: "—", month: "Sin fecha", time: "", place: "Por concretar" };
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
    const created = { ...clone(proposal), id: `prop_demo_${crypto.randomUUID()}`, status: "IDEA", budgets: [], voting: null };
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

  async setProposalVotingStatus(proposalId, status) {
    await delay(180);
    const proposal = (this.data.proposals ?? []).find((item) => item.id === proposalId);
    if (!proposal) throw new Error("La propuesta no existe.");
    if (!proposal.voting) {
      if (status !== "ABIERTA") throw new Error("Primero hay que abrir la votación.");
      proposal.voting = { id: `vot_demo_${crypto.randomUUID()}`, status: "ABIERTA", openedAt: new Date().toISOString(), closedAt: null, votes: [] };
      proposal.status = "PENDIENTE_VOTACION";
    } else if (proposal.voting.status === "CERRADA") throw new Error("La votación ya está cerrada.");
    else if (status === "CERRADA") Object.assign(proposal.voting, { status: "CERRADA", closedAt: new Date().toISOString() });
    return clone(proposal.voting);
  }

  async castProposalVote(proposalId, familyId, vote) {
    await delay(160);
    const proposal = (this.data.proposals ?? []).find((item) => item.id === proposalId);
    if (!proposal?.voting || proposal.voting.status !== "ABIERTA") throw new Error("La votación no está abierta.");
    if (!this.data.families.some((family) => family.id === familyId && family.active)) throw new Error("La familia no existe o está inactiva.");
    const votes = proposal.voting.votes ?? [];
    const saved = { familyId, familyName: this.data.families.find((family) => family.id === familyId).name, vote, date: new Date().toISOString() };
    const index = votes.findIndex((item) => item.familyId === familyId);
    if (index >= 0) votes[index] = saved; else votes.push(saved);
    proposal.voting.votes = votes;
    return clone(saved);
  }

  async createMeeting(meeting) {
    await delay(220);
    const created = { ...clone(meeting), id: `reu_demo_${crypto.randomUUID()}`, status: "PLANIFICADA", agenda: [] };
    this.data.meetings = [created, ...(this.data.meetings ?? [])]; this.refreshNextMeeting(); return clone(created);
  }

  async updateMeeting(meeting) {
    await delay(220);
    const index = (this.data.meetings ?? []).findIndex((item) => item.id === meeting.id);
    if (index < 0) throw new Error("La reunión no existe.");
    this.data.meetings[index] = { ...this.data.meetings[index], ...clone(meeting) }; this.refreshNextMeeting(); return clone(this.data.meetings[index]);
  }

  async deleteMeeting(id) {
    await delay(180);
    const target = (this.data.meetings ?? []).find((item) => item.id === id);
    if (target?.minutes?.status === "CERRADA") throw new Error("No se puede eliminar una reunión con el acta cerrada.");
    const before = (this.data.meetings ?? []).length; this.data.meetings = (this.data.meetings ?? []).filter((item) => item.id !== id);
    if (this.data.meetings.length === before) throw new Error("La reunión no existe.");
    this.refreshNextMeeting(); return true;
  }

  async createAgendaItem(item) {
    await delay(180);
    const meeting = (this.data.meetings ?? []).find((value) => value.id === item.meetingId);
    if (!meeting) throw new Error("La reunión no existe.");
    const created = { ...clone(item), id: `ord_demo_${crypto.randomUUID()}`, position: (meeting.agenda?.length ?? 0) + 1, proposalTitle: (this.data.proposals ?? []).find((proposal) => proposal.id === item.proposalId)?.title ?? null };
    meeting.agenda = [...(meeting.agenda ?? []), created]; return clone(created);
  }

  async updateAgendaItem(item) {
    await delay(180);
    for (const meeting of this.data.meetings ?? []) {
      const index = (meeting.agenda ?? []).findIndex((value) => value.id === item.id);
      if (index >= 0) { meeting.agenda[index] = { ...meeting.agenda[index], ...clone(item), proposalTitle: (this.data.proposals ?? []).find((proposal) => proposal.id === item.proposalId)?.title ?? null }; return clone(meeting.agenda[index]); }
    }
    throw new Error("El punto no existe.");
  }

  async deleteAgendaItem(id) {
    await delay(150);
    for (const meeting of this.data.meetings ?? []) {
      const filtered = (meeting.agenda ?? []).filter((item) => item.id !== id);
      if (filtered.length !== (meeting.agenda ?? []).length) { meeting.agenda = filtered.map((item, index) => ({ ...item, position: index + 1 })); return true; }
    }
    throw new Error("El punto no existe.");
  }

  async reorderAgendaItems(meetingId, itemIds) {
    await delay(140);
    const meeting = (this.data.meetings ?? []).find((item) => item.id === meetingId);
    if (!meeting || itemIds.length !== (meeting.agenda ?? []).length || new Set(itemIds).size !== itemIds.length) throw new Error("El orden no es válido.");
    const byId = new Map(meeting.agenda.map((item) => [item.id, item]));
    if (itemIds.some((id) => !byId.has(id))) throw new Error("El orden no es válido.");
    meeting.agenda = itemIds.map((id, index) => ({ ...byId.get(id), position: index + 1 })); return true;
  }

  async createMeetingMinutes(meetingId) {
    await delay(180);
    const meeting = (this.data.meetings ?? []).find((item) => item.id === meetingId);
    if (!meeting || meeting.minutes) throw new Error("La reunión no existe o ya tiene acta.");
    meeting.minutes = { id: `act_demo_${crypto.randomUUID()}`, meetingId, date: meeting.date, content: "", status: "BORRADOR", closedAt: null, attendees: [], items: (meeting.agenda ?? []).map((item) => ({ id: `acp_demo_${crypto.randomUUID()}`, agendaItemId: item.id, position: item.position, subject: item.title, summary: "", decision: "", votingResult: null, observations: "" })) };
    return clone(meeting.minutes);
  }

  async updateMeetingMinutes(minutes) {
    await delay(180);
    const meeting = (this.data.meetings ?? []).find((item) => item.minutes?.id === minutes.id);
    if (!meeting?.minutes || meeting.minutes.status === "CERRADA") throw new Error("El acta no existe o está cerrada.");
    meeting.minutes = { ...meeting.minutes, content: minutes.content, status: minutes.status, attendees: minutes.attendeeFamilyIds.map((familyId) => ({ familyId, familyName: this.data.families.find((family) => family.id === familyId)?.name ?? "Familia" })) };
    return true;
  }

  async updateMinutesItem(item) {
    await delay(160);
    for (const meeting of this.data.meetings ?? []) {
      if (meeting.minutes?.status === "CERRADA") continue;
      const index = meeting.minutes?.items?.findIndex((value) => value.id === item.id) ?? -1;
      if (index >= 0) { meeting.minutes.items[index] = { ...meeting.minutes.items[index], summary: item.summary, decision: item.decision, observations: item.observations }; return true; }
    }
    throw new Error("El punto del acta no existe o está cerrado.");
  }

  async closeMeetingMinutes(id) {
    await delay(180);
    const meeting = (this.data.meetings ?? []).find((item) => item.minutes?.id === id);
    if (!meeting?.minutes || meeting.minutes.status === "CERRADA") throw new Error("El acta no existe o ya está cerrada.");
    if (!meeting.minutes.attendees.length || meeting.minutes.items.some((item) => !item.summary || !item.decision)) throw new Error("Completa asistentes, resúmenes y decisiones.");
    Object.assign(meeting.minutes, { status: "CERRADA", closedAt: new Date().toISOString() }); meeting.status = "CELEBRADA"; this.refreshNextMeeting(); return true;
  }

  async createDocument(document) {
    await delay(180);
    const created = { ...clone(document), id: `doc_demo_${crypto.randomUUID()}` };
    this.data.documents = [created, ...(this.data.documents ?? [])];
    return clone(created);
  }

  async updateDocument(document) {
    await delay(180);
    const index = (this.data.documents ?? []).findIndex((item) => item.id === document.id);
    if (index < 0) throw new Error("El documento no existe.");
    this.data.documents[index] = { ...this.data.documents[index], ...clone(document) };
    return clone(this.data.documents[index]);
  }

  async deleteDocument(id) {
    await delay(160);
    const before = (this.data.documents ?? []).length;
    this.data.documents = (this.data.documents ?? []).filter((item) => item.id !== id);
    if (this.data.documents.length === before) throw new Error("El documento no existe.");
    return true;
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
    const [snapshot, proposals, meetings, minutes, documents] = await Promise.all([this.rpc("get_community_snapshot"), this.rpc("list_proposals"), this.rpc("list_meetings"), this.rpc("list_meeting_minutes"), this.rpc("list_documents")]);
    const next = [...meetings].filter((meeting) => meeting.status === "PLANIFICADA" && meeting.date >= new Date().toISOString().slice(0, 10)).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
    const nextMeeting = next ? { day: Number(next.date.slice(8, 10)), month: new Intl.DateTimeFormat("es-ES", { month: "long" }).format(new Date(`${next.date}T12:00:00`)), time: next.time, place: next.place } : { day: "—", month: "Sin fecha", time: "", place: "Por concretar" };
    const minutesByMeeting = new Map(minutes.map((item) => [item.meetingId, item]));
    return { ...snapshot, community: { ...snapshot.community, nextMeeting }, proposals, meetings: meetings.map((meeting) => ({ ...meeting, minutes: minutesByMeeting.get(meeting.id) ?? null })), documents };
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

  setProposalVotingStatus(proposalId, status) { return this.rpc("set_proposal_voting_status", { p_proposal_id: proposalId, p_status: status }); }

  castProposalVote(proposalId, familyId, vote) { return this.rpc("cast_proposal_vote", { p_proposal_id: proposalId, p_family_id: familyId, p_vote: vote }); }

  createMeeting(meeting) { return this.rpc("create_meeting", { p_date: meeting.date, p_time: meeting.time, p_place: meeting.place, p_notes: meeting.notes ?? "" }); }
  updateMeeting(meeting) { return this.rpc("update_meeting", { p_id: meeting.id, p_date: meeting.date, p_time: meeting.time, p_place: meeting.place, p_status: meeting.status, p_notes: meeting.notes ?? "" }); }
  deleteMeeting(id) { return this.rpc("delete_meeting", { p_id: id }); }
  createAgendaItem(item) { return this.rpc("create_agenda_item", { p_meeting_id: item.meetingId, p_title: item.title, p_description: item.description ?? "", p_proposal_id: item.proposalId || null, p_notes: item.notes ?? "" }); }
  updateAgendaItem(item) { return this.rpc("update_agenda_item", { p_id: item.id, p_title: item.title, p_description: item.description ?? "", p_proposal_id: item.proposalId || null, p_notes: item.notes ?? "" }); }
  deleteAgendaItem(id) { return this.rpc("delete_agenda_item", { p_id: id }); }
  reorderAgendaItems(meetingId, itemIds) { return this.rpc("reorder_agenda_items", { p_meeting_id: meetingId, p_item_ids: itemIds }); }
  createMeetingMinutes(meetingId) { return this.rpc("create_meeting_minutes", { p_meeting_id: meetingId }); }
  updateMeetingMinutes(minutes) { return this.rpc("update_meeting_minutes", { p_id: minutes.id, p_attendee_family_ids: minutes.attendeeFamilyIds, p_content: minutes.content ?? "", p_status: minutes.status }); }
  updateMinutesItem(item) { return this.rpc("update_minutes_item", { p_id: item.id, p_summary: item.summary, p_decision: item.decision, p_observations: item.observations ?? "" }); }
  closeMeetingMinutes(id) { return this.rpc("close_meeting_minutes", { p_id: id }); }
  createDocument(document) { return this.rpc("create_document", { p_name: document.name, p_type: document.type, p_date: document.date, p_url: document.url, p_entity_type: document.entityType, p_entity_id: document.entityId || null, p_visibility: document.visibility, p_notes: document.notes ?? "" }); }
  updateDocument(document) { return this.rpc("update_document", { p_id: document.id, p_name: document.name, p_type: document.type, p_date: document.date, p_url: document.url, p_entity_type: document.entityType, p_entity_id: document.entityId || null, p_visibility: document.visibility, p_notes: document.notes ?? "" }); }
  deleteDocument(id) { return this.rpc("delete_document", { p_id: id }); }
}

export function createDataService(config = globalThis.APP_CONFIG) {
  if (config?.dataSource === "supabase" && config?.supabaseUrl && config?.supabasePublishableKey) {
    return new SupabaseDataService(config.supabaseUrl, config.supabasePublishableKey);
  }
  return new DemoDataService();
}
