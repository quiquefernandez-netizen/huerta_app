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

  async createAssessment(assessment) {
    await delay(280);
    const created = { ...clone(assessment), id: `der_demo_${crypto.randomUUID()}`, status: "ACTIVA" };
    this.data.assessments.unshift(created);
    return clone(created);
  }

  async createWaterReading(reading) {
    await delay(240);
    const created = { ...clone(reading), id: `lec_demo_${crypto.randomUUID()}` };
    this.data.waterReadings.push(created);
    return clone(created);
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

  getSnapshot() {
    return this.rpc("get_community_snapshot");
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

  createAssessment(assessment) {
    return this.rpc("create_assessment", {
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
}

export function createDataService(config = globalThis.APP_CONFIG) {
  if (config?.dataSource === "supabase" && config?.supabaseUrl && config?.supabasePublishableKey) {
    return new SupabaseDataService(config.supabaseUrl, config.supabasePublishableKey);
  }
  return new DemoDataService();
}
