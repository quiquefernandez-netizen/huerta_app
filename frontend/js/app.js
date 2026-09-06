import { createDataService } from "./services/data-service.js";
import { createAuthService } from "./services/auth-service.js";
import { calculateAnnualQuotaCents, calculateExpectedQuotaCents, calculateFamilyAccount, calculateWaterCostCents, calculateWaterUsage, createWaterSettlementPreview, formatDate, formatMoney, splitCentsEvenly, sumCents } from "./domain.js";
import { escapeHtml, safeCssColor } from "./html.js";
import { detectBankDuplicates, normalizeBankRows } from "./services/bank-import.js";

const routes = [
  { id: "inicio", label: "Inicio", icon: "home", enabled: true },
  { id: "familias", label: "Familias", icon: "people", enabled: true },
  { id: "banco", label: "Banco", icon: "bank", enabled: true },
  { id: "gastos", label: "Gastos", icon: "receipt", enabled: true },
  { id: "agua", label: "Agua", icon: "water", enabled: true },
  { id: "propuestas", label: "Propuestas", icon: "bulb", enabled: true },
  { id: "reuniones", label: "Reuniones", icon: "calendar", enabled: true },
  { id: "documentos", label: "Documentos", icon: "folder", enabled: false },
  { id: "administracion", label: "Administración", icon: "settings", enabled: true }
];

const authService = createAuthService();
globalThis.HUERTA_AUTH_SESSION = authService;
const service = createDataService();
const pageContent = document.querySelector("#page-content");
const loadingState = document.querySelector("#loading-state");
let data;
let expenseFilter = "Todas";
let bankPreview = null;
let bankRules = [];
let bankMovementFilter = "all";

function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function isAdministrator() {
  return data?.viewer?.role === "ADMINISTRADOR";
}

function activeQuotaPlan() {
  return data.quotaPlans?.find((plan) => plan.active) ?? { year: new Date().getFullYear(), monthlyAmountCents: 0, annualAmountCents: 0, dueThroughMonth: 1 };
}

function currentWaterTariff() {
  const today = todayIso();
  return (data.waterTariffs ?? []).find((tariff) => tariff.active && tariff.validFrom <= today && (!tariff.validUntil || tariff.validUntil >= today))
    ?? { validFrom: today, priceCentsPerM3: data.community.waterPriceCentsPerM3, notes: "" };
}

function expectedQuotaCents() {
  const plan = activeQuotaPlan();
  return calculateExpectedQuotaCents(plan.monthlyAmountCents, plan.dueThroughMonth);
}

function familyAccount(familyId) {
  return calculateFamilyAccount({
    familyId,
    expectedQuotaCents: expectedQuotaCents(),
    contributions: data.contributions ?? [],
    waterSettlements: data.waterSettlements ?? [],
    assessments: data.assessments ?? [],
    expenses: data.expenses ?? []
  });
}

function familyAccountStatus(account) {
  if (!account.quotaChargesCents) return { key: "paid", label: "Sin cuota configurada" };
  if (account.extraContributionsCents > 0) return { key: "exceeded", label: "Cuota cubierta + extra" };
  if (!account.quotaPendingCents) return { key: "paid", label: "Cuota cubierta" };
  if (account.contributionsCents > 0) return { key: "partial", label: "Cuota parcial" };
  return { key: "pending", label: "Sin aportación" };
}

function contributionsForFamily(familyId) {
  return (data.contributions ?? []).filter((contribution) => contribution.familyId === familyId).sort((a, b) => b.date.localeCompare(a.date));
}

function familyLedgerEntries(familyId) {
  const entries = [];
  contributionsForFamily(familyId).forEach((item) => entries.push({ id: item.id, date: item.date, concept: item.concept, type: "Aportación", amountCents: item.amountCents }));
  (data.expenses ?? []).forEach((expense) => (expense.payers ?? []).filter((payer) => payer.familyId === familyId).forEach((payer) => entries.push({ id: `${expense.id}_${familyId}`, date: expense.date, concept: `Adelanto: ${expense.concept}`, type: "Saldo a favor", amountCents: payer.amountCents })));
  (data.waterSettlements ?? []).forEach((settlement) => (settlement.items ?? []).filter((item) => item.familyId === familyId).forEach((item) => entries.push({ id: `${settlement.id}_${familyId}`, date: settlement.periodEnd, concept: "Liquidación de agua", type: "Cargo", amountCents: -item.amountCents })));
  (data.assessments ?? []).forEach((assessment) => (assessment.allocations ?? []).filter((item) => item.familyId === familyId).forEach((item) => entries.push({ id: `${assessment.id}_${familyId}`, date: assessment.date, concept: `Derrama: ${assessment.concept}`, type: "Cargo", amountCents: -item.amountCents })));
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function pendingWaterSettlement() {
  return createWaterSettlementPreview({
    families: data.families,
    readings: data.waterReadings,
    settledReadings: data.lastWaterSettlement?.settledReadings ?? [],
    priceCentsPerM3: data.community.waterPriceCentsPerM3
  });
}

function waterSettlementState() {
  try {
    return { preview: pendingWaterSettlement(), error: "" };
  } catch (error) {
    return { preview: null, error: error.message };
  }
}

function visibleRoutes() {
  return routes.filter((route) => route.id !== "administracion" || isAdministrator());
}

function renderNavigation(activeRoute) {
  const navItem = (route, mobile = false) => {
    const isActive = route.id === activeRoute;
    const mobileVisible = ["inicio", "familias", "gastos", "agua"].includes(route.id);
    if (mobile && !mobileVisible) return "";
    const suffix = route.enabled ? "" : `<span class="nav-item__soon">Pronto</span>`;
    const disabled = route.enabled ? "" : ` aria-disabled="true" tabindex="-1"`;
    return `<a class="nav-item${isActive ? " is-active" : ""}${route.enabled ? "" : " is-disabled"}" href="#${route.id}"${disabled}>${icon(route.icon)}<span>${route.label}</span>${suffix}</a>`;
  };

  document.querySelector("[data-navigation]").innerHTML = visibleRoutes().map((route) => navItem(route)).join("");
  const mobileRoutes = visibleRoutes().filter((route) => ["inicio", "familias", "gastos", "agua"].includes(route.id));
  document.querySelector("[data-mobile-navigation]").innerHTML = mobileRoutes.map((route) => navItem(route, true)).join("") + `<button class="nav-item" type="button" data-more>${icon("more")}<span>Más</span></button>`;
}

function renderDashboard() {
  const activeFamilies = data.families.filter((family) => family.active);
  const plan = activeQuotaPlan();
  const upToDate = activeFamilies.filter((family) => familyAccount(family.id).quotaPendingCents === 0).length;
  const activeFamilyCount = data.community.activeFamilyCount ?? activeFamilies.length;
  const maxMonthlyExpense = Math.max(1, ...data.monthlyExpensesCents);
  const categoryTotal = sumCents(data.expenseCategories, (category) => category.amountCents);
  let segmentStart = 0;
  const expenseSegments = data.expenseCategories.filter((category) => category.amountCents > 0).map((category) => {
    const segmentEnd = segmentStart + (category.amountCents / categoryTotal) * 100;
    const gapStart = Math.max(segmentStart, segmentEnd - 0.85);
    const segment = `${safeCssColor(category.color)} ${segmentStart.toFixed(2)}% ${gapStart.toFixed(2)}%, var(--surface) ${gapStart.toFixed(2)}% ${segmentEnd.toFixed(2)}%`;
    segmentStart = segmentEnd;
    return segment;
  }).join(", ");
  const waterTotalM3 = waterSettlementState().preview?.totalUsageM3 ?? 0;
  const yearlyDifferenceCents = data.community.yearlyIncomeCents - data.community.yearlyExpensesCents;
  const pendingFamilies = activeFamilies.length - upToDate;
  const latestBankMovement = [...(data.bankMovements ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
  const bankBalanceCents = latestBankMovement?.balanceCents ?? null;

  return `
    <section class="summary-grid" aria-label="Resumen de la comunidad">
      <article class="summary-card summary-card--balance"><span class="summary-card__icon">${icon("trend")}</span><div><p>Saldo actual</p><strong>${formatMoney(data.community.currentBalanceCents)}</strong><small>${formatMoney(yearlyDifferenceCents)} este año</small></div></article>
      <article class="summary-card"><span class="summary-card__icon summary-card__icon--sun">${icon("receipt")}</span><div><p>Gastos del año</p><strong>${formatMoney(data.community.yearlyExpensesCents)}</strong><small>${formatMoney(data.community.yearlyIncomeCents)} ingresados</small></div></article>
      <article class="summary-card"><span class="summary-card__icon summary-card__icon--blue">${icon("people")}</span><div><p>Cuota mensual</p><strong>${formatMoney(plan.monthlyAmountCents)}</strong><small>${upToDate} de ${activeFamilyCount} familias al día</small></div></article>
      <article class="summary-card"><span class="summary-card__icon summary-card__icon--clay">${icon("calendar")}</span><div><p>Próxima reunión</p><strong>${escapeHtml(data.community.nextMeeting.day)} ${escapeHtml(data.community.nextMeeting.month)}</strong><small>${escapeHtml(data.community.nextMeeting.time)} · ${escapeHtml(data.community.nextMeeting.place)}</small></div></article>
      <a class="summary-card" href="#banco"><span class="summary-card__icon summary-card__icon--blue">${icon("bank")}</span><div><p>Banco</p><strong>${bankBalanceCents === null ? "—" : formatMoney(bankBalanceCents)}</strong><small>${latestBankMovement ? `Saldo a ${formatDate(latestBankMovement.date)}` : "Sin extractos importados"}</small></div></a>
    </section>
    <section class="dashboard-grid">
      <article class="panel chart-panel">
        <div class="panel__heading"><div><p class="section-kicker">Últimos 9 meses</p><h3>Evolución de gastos</h3></div><strong>${formatMoney(data.community.yearlyExpensesCents)}</strong></div>
        <div class="bar-chart" aria-label="Gráfico de gastos mensuales">
          ${data.monthlyExpensesCents.map((amount, index) => `<div class="bar-chart__item"><span class="bar-chart__value">${formatMoney(amount)}</span><span class="bar-chart__bar" style="--bar-height:${Math.round((amount / maxMonthlyExpense) * 100)}%"></span><small>${["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep"][index]}</small></div>`).join("")}
        </div>
      </article>
      <article class="panel categories-panel">
        <div class="panel__heading"><div><p class="section-kicker">Este año</p><h3>¿En qué gastamos?</h3></div></div>
        <div class="donut" style="--segments:${expenseSegments}" role="img" aria-label="Reparto de ${formatMoney(categoryTotal)} en gastos por categoría"><div><span>${formatMoney(categoryTotal)}</span><small>Total anual</small></div></div>
        <ul class="legend-list">${data.expenseCategories.map((category) => {
          const percentage = categoryTotal ? Math.round((category.amountCents / categoryTotal) * 100) : 0;
          return `<li><span class="legend-dot" style="--dot:${safeCssColor(category.color)}"></span><span class="legend-copy"><span>${escapeHtml(category.name)}</span><small>${percentage} % del gasto</small></span><strong>${formatMoney(category.amountCents)}</strong></li>`;
        }).join("")}</ul>
      </article>
      <article class="panel water-glance">
        <span class="water-glance__icon">${icon("water")}</span>
        <div><p class="section-kicker">Agua · última lectura</p><h3>${waterTotalM3.toLocaleString("es-ES", { maximumFractionDigits: 1 })} m³ consumidos</h3><p>Consumo general del último periodo registrado.</p></div>
        <a class="text-link" href="#agua">Ver agua ${icon("arrow")}</a>
      </article>
      <article class="panel attention-card">
        <span class="attention-card__badge">${pendingFamilies}</span>
        <div><p class="section-kicker">${pendingFamilies ? "Cuota por completar" : "Cuotas cubiertas"}</p><h3>${pendingFamilies ? `${pendingFamilies} ${pendingFamilies === 1 ? "familia aún no cubre" : "familias aún no cubren"} la cuota prevista` : "Todas las familias cubren la cuota prevista"}</h3><p>La cuota es una referencia; no se resta de las aportaciones.</p></div>
        <a class="text-link" href="#familias">Revisar ${icon("arrow")}</a>
      </article>
    </section>`;
}

function formatDecimal(value, maximumFractionDigits = 1) {
  return value.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits });
}

function todayIso() {
  const today = new Date();
  const offsetMilliseconds = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offsetMilliseconds).toISOString().slice(0, 10);
}

function familyMonogram(family) {
  return family.shortName.slice(0, 2).toUpperCase();
}

function renderFamilies() {
  const activeFamilies = data.families.filter((family) => family.active);
  const accounts = new Map(activeFamilies.map((family) => [family.id, familyAccount(family.id)]));
  const totalContributedCents = sumCents([...accounts.values()], (account) => account.contributionsCents);
  const totalQuotaCoveredCents = sumCents([...accounts.values()], (account) => account.quotaCoveredCents);
  const totalExtraCents = sumCents([...accounts.values()], (account) => account.extraContributionsCents);
  const totalSettledChargesCents = sumCents([...accounts.values()], (account) => account.waterChargesCents + account.assessmentChargesCents);

  return `
    <section class="inline-summary" aria-label="Resumen de aportaciones">
      <div><span>Total aportado</span><strong>${formatMoney(totalContributedCents)}</strong></div>
      <div><span>Aplicado a cuota</span><strong>${formatMoney(totalQuotaCoveredCents)}</strong></div>
      <div><span>Aportación extra</span><strong>${formatMoney(totalExtraCents)}</strong></div>
      <div><span>Agua y derramas</span><strong>${formatMoney(totalSettledChargesCents)}</strong></div>
    </section>
    <section class="family-grid" aria-label="Listado de familias">
      ${activeFamilies.map((family, index) => {
        const account = accounts.get(family.id);
        const status = familyAccountStatus(account);
        return `<article class="family-card" style="--family-accent:${["#2e654e", "#3f7f8b", "#bd654d", "#8a6a45", "#6d668a"][index % 5]}">
          <button class="family-card__button" type="button" data-family-id="${escapeHtml(family.id)}" aria-label="Ver detalles de ${escapeHtml(family.name)}">
            <span class="family-avatar" aria-hidden="true">${escapeHtml(familyMonogram(family))}</span>
            <span class="family-card__title"><strong>${escapeHtml(family.name)}</strong><small>${family.members} ${family.members === 1 ? "miembro" : "miembros"}</small></span>
            ${icon("arrow")}
          </button>
          <div class="family-card__body">
            <span class="status-pill status-pill--${status.key}">${status.label}</span>
            <div class="money-pair money-pair--balance"><span>Total aportado</span><strong>${formatMoney(account.contributionsCents)}</strong></div>
            <div class="family-card__account"><span><small>Para cuota</small><strong>${formatMoney(account.quotaCoveredCents)}</strong></span><span><small>Extra aportado</small><strong>${formatMoney(account.extraContributionsCents)}</strong></span></div>
            <div class="family-card__foot"><span>Cuota prevista ${formatMoney(account.quotaChargesCents)}</span><span>${account.chargesCents ? `Liquidaciones ${formatMoney(account.chargesCents)}` : "Sin liquidaciones"}</span></div>
          </div>
        </article>`;
      }).join("")}
    </section>`;
}

function renderExpenses() {
  const categories = ["Todas", ...new Set(data.expenses.map((expense) => expense.category))];
  const visibleExpenses = expenseFilter === "Todas" ? data.expenses : data.expenses.filter((expense) => expense.category === expenseFilter);
  const maxCategory = Math.max(1, ...data.expenseCategories.map((category) => category.amountCents));
  const familyName = (familyId) => data.families.find((family) => family.id === familyId)?.shortName ?? "Familia";
  const payerLabel = (expense) => expense.paymentSource === "COMMUNITY"
    ? "Pagado desde la cuenta de la comunidad"
    : `Adelantado por ${(expense.payers ?? []).map((payer) => familyName(payer.familyId)).join(", ")}`;

  return `
    <section class="expense-overview">
      <article class="feature-total"><span>${icon("receipt")}</span><div><p>Total este año</p><strong>${formatMoney(data.community.yearlyExpensesCents)}</strong><small>Media de ${formatMoney(Math.round(data.community.yearlyExpensesCents / 9))} al mes</small></div></article>
      <article class="panel category-bars">
        <div class="panel__heading"><div><p class="section-kicker">Por categoría</p><h3>Distribución del gasto</h3></div></div>
        ${data.expenseCategories.map((category) => `<div class="category-bar"><div><span><i style="--dot:${safeCssColor(category.color)}"></i>${escapeHtml(category.name)}</span><strong>${formatMoney(category.amountCents)}</strong></div><span class="progress-track"><span style="width:${Math.round(category.amountCents / maxCategory * 100)}%;background:${safeCssColor(category.color)}"></span></span></div>`).join("")}
      </article>
    </section>
    <section class="list-section assessment-section">
      <div class="list-section__heading"><div><p class="section-kicker">Cargos extraordinarios</p><h3>Derramas</h3></div><span class="help-label">Solo afectan a las familias elegidas</span></div>
      <div class="assessment-grid">${(data.assessments ?? []).length ? data.assessments.map((assessment) => `<article class="assessment-card"><span class="assessment-card__icon">${icon("people")}</span><div><strong>${escapeHtml(assessment.concept)}</strong><small>${formatDate(assessment.date)} · ${assessment.allocations.length} ${assessment.allocations.length === 1 ? "familia" : "familias"}</small><span>${assessment.allocations.map((item) => escapeHtml(familyName(item.familyId))).join(" · ")}</span></div><div class="record-actions"><strong>${formatMoney(assessment.totalAmountCents)}</strong><button class="text-link" type="button" data-edit-assessment="${escapeHtml(assessment.id)}">Editar</button></div></article>`).join("") : `<div class="empty-list"><strong>No hay derramas.</strong><span>Los gastos ordinarios no se reparten automáticamente.</span></div>`}</div>
    </section>
    <section class="list-section">
      <div class="list-section__heading"><div><p class="section-kicker">Movimientos recientes</p><h3>Últimos gastos</h3></div><div class="filter-chips" aria-label="Filtrar gastos">${categories.map((category) => `<button type="button" class="filter-chip${category === expenseFilter ? " is-active" : ""}" data-expense-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div></div>
      <div class="expense-list">${visibleExpenses.length ? visibleExpenses.map((expense) => `<article class="expense-row"><span class="expense-row__icon">${icon("receipt")}</span><div class="expense-row__main"><strong>${escapeHtml(expense.concept)}</strong><span>${escapeHtml(expense.provider)} · ${escapeHtml(expense.category)}</span><small>${escapeHtml(payerLabel(expense))}</small></div><time datetime="${escapeHtml(expense.date)}">${formatDate(expense.date)}</time><div class="record-actions"><strong class="expense-row__amount">−${formatMoney(expense.amountCents)}</strong><button class="text-link" type="button" data-edit-expense="${escapeHtml(expense.id)}">Editar</button></div></article>`).join("") : `<div class="empty-list"><strong>No hay gastos en esta categoría.</strong><span>Prueba con otro filtro.</span></div>`}</div>
    </section>`;
}

function latestWaterReadings() {
  return data.families.filter((family) => family.active).map((family) => {
    const readings = data.waterReadings.filter((reading) => reading.familyId === family.id).sort((a, b) => b.date.localeCompare(a.date));
    return { family, reading: readings[0] };
  }).filter((item) => item.reading);
}

function isWaterReadingSettled(reading) {
  return (data.waterSettlements ?? []).some((settlement) => (settlement.items ?? []).some((item) => item.familyId === reading.familyId && item.meterId === reading.meterId && Number(item.currentReadingM3) === Number(reading.readingM3)));
}

function renderWater() {
  const readings = latestWaterReadings();
  const settlementState = waterSettlementState();
  const settlement = settlementState.preview;
  const settlementByFamily = new Map((settlement?.items ?? []).map((item) => [item.familyId, item]));
  const totalUsageM3 = settlement?.totalUsageM3 ?? 0;
  const totalCostCents = settlement?.totalAmountCents ?? 0;
  const latestDate = readings.map((item) => item.reading.date).sort().at(-1);
  const settlementOrigin = data.lastWaterSettlement?.date
    ? `Desde la liquidación del ${formatDate(data.lastWaterSettlement.date)}.`
    : "Aún no existe una liquidación anterior; primero hay que preparar las lecturas de referencia.";
  const tariff = currentWaterTariff();

  return `
    <p class="page-note">${latestDate ? `Última lectura ${formatDate(latestDate)}. ` : ""}${settlementOrigin}</p>
    <section class="water-summary">
      <article><span class="water-summary__icon">${icon("water")}</span><div><p>Consumo sin liquidar</p><strong>${formatDecimal(totalUsageM3)} m³</strong><small>${formatDecimal(totalUsageM3 * 1000, 0)} litros entre todas las familias</small></div></article>
      <article><span class="water-summary__icon water-summary__icon--coins">${icon("coins")}</span><div><p>Total a liquidar</p><strong>${formatMoney(totalCostCents)}</strong><small>Cada familia paga su propio consumo</small></div></article>
      <article class="tariff-card"><div><p>Tarifa actual</p><strong>${formatMoney(tariff.priceCentsPerM3)}<small>/ m³</small></strong></div><span>Desde ${formatDate(tariff.validFrom)}</span></article>
    </section>
    <section class="list-section">
      <div class="list-section__heading"><div><p class="section-kicker">Por familia</p><h3>Últimas lecturas</h3></div><span class="help-label">Toca una tarjeta para ver el historial</span></div>
      <div class="water-family-grid">${readings.length ? readings.map(({ family, reading }) => {
        const item = settlementByFamily.get(family.id);
        const usage = item?.usageM3 ?? 0;
        const cost = item?.amountCents ?? 0;
        return `<div class="water-family-entry"><button class="water-family-card" type="button" data-water-history="${escapeHtml(family.id)}">
          <span class="family-avatar" aria-hidden="true">${escapeHtml(familyMonogram(family))}</span>
          <span class="water-family-card__name"><strong>${escapeHtml(family.name)}</strong><small>Contador ${escapeHtml(reading.meterId.replace("con_", "").toUpperCase())}</small></span>
          <span class="reading-pair"><small>Lectura actual</small><strong>${formatDecimal(reading.readingM3)} m³</strong></span>
          <span class="usage-pill"><small>Consumo</small><strong>${formatDecimal(usage)} m³</strong></span>
          <span class="reading-cost"><small>Importe</small><strong>${formatMoney(cost)}</strong></span>
          ${icon("arrow")}
        </button></div>`;
      }).join("") : `<div class="empty-list"><strong>Aún no hay lecturas de agua.</strong><span>Administración debe preparar primero los contadores.</span></div>`}</div>
    </section>
    ${settlementState.error ? `<aside class="info-note info-note--warning">${icon("water")}<p><strong>Aún no se puede liquidar.</strong> ${escapeHtml(settlementState.error)}</p></aside>` : ""}
    <aside class="info-note">${icon("leaf")}<p><strong>El agua entra en el saldo de cada familia.</strong> Al confirmar, el importe se añade como cargo y se compensa automáticamente con cualquier saldo que tuviera a favor.</p></aside>`;
}

function renderPlaceholder(title) {
  return `<section class="empty-page"><span>${icon("calendar", "empty-page__icon")}</span><p class="section-kicker">Próxima fase</p><h2>${title}</h2><p>Esta sección está prevista, pero aún no forma parte de esta primera iteración.</p><a href="#inicio" class="secondary-button">Volver a Inicio</a></section>`;
}

function reconciliationRuleTarget(rule) {
  if (rule.familyName) return `Familia: ${rule.familyName}`;
  if (rule.categoryName) return `Gasto: ${rule.categoryName}`;
  const family = data.families.find((item) => item.id === rule.familyId);
  if (family) return `Familia: ${family.name}`;
  const category = data.expenseCategories.find((item) => item.id === rule.categoryId || item.name === rule.categoryName);
  return category ? `Gasto: ${category.name}` : "Sin destino";
}

async function openBankRulesDialog(editRuleId = null) {
  if (!isAdministrator()) return;
  try { bankRules = await service.listReconciliationRules(); } catch (error) { showToast(error.message); bankRules = []; }
  const editingRule = bankRules.find((item) => item.id === editRuleId);
  const familyOptions = data.families.filter((item) => item.active).map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  const categoryOptions = data.expenseCategories.map((item) => `<option value="${escapeHtml(item.name)}"${editingRule?.categoryName === item.name ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("");
  const ruleRows = bankRules.length ? bankRules.map((rule) => `<article class="rule-row${rule.active ? "" : " is-disabled"}"><div><strong>${escapeHtml(rule.pattern)}</strong><small>${escapeHtml(reconciliationRuleTarget(rule))} · ${rule.matchType === "EXACT" ? "Coincidencia exacta" : "Contiene el texto"}</small></div><label class="switch-label"><input type="checkbox" data-rule-toggle="${escapeHtml(rule.id)}"${rule.active ? " checked" : ""}><span>${rule.active ? "Activa" : "Inactiva"}</span></label><button class="icon-button" type="button" data-rule-edit="${escapeHtml(rule.id)}" aria-label="Editar regla">${icon("settings")}</button><button class="icon-button" type="button" data-rule-delete="${escapeHtml(rule.id)}" aria-label="Eliminar regla">${icon("trash")}</button></article>`).join("") : `<p class="empty-copy">Todavía no hay reglas. Añade una para que las próximas previsualizaciones propongan la asignación.</p>`;
  const targetType = editingRule?.categoryName ? "category" : "family";
  const selectedFamilyOptions = familyOptions.replace(`value="${escapeHtml(editingRule?.familyId ?? "")}"`, `value="${escapeHtml(editingRule?.familyId ?? "")}" selected`);
  openDialog(`${dialogHeader("Banco", "Reglas de conciliación")}<p class="form-help">Una regla activa propone automáticamente una familia o categoría. Las reglas con menor prioridad se prueban primero.</p><div class="rule-list">${ruleRows}</div><form class="dialog-form" id="reconciliation-rule-form"><input type="hidden" name="id" value="${escapeHtml(editingRule?.id ?? "")}"><h3>${editingRule ? "Editar regla" : "Nueva regla"}</h3><label>Texto del concepto<input name="pattern" required minlength="2" placeholder="Ej. IBERDROLA o AEAT" value="${escapeHtml(editingRule?.pattern ?? "")}"></label><div class="form-row"><label>Destino<select name="targetType"><option value="family"${targetType === "family" ? " selected" : ""}>Familia</option><option value="category"${targetType === "category" ? " selected" : ""}>Categoría de gasto</option></select></label><label>Coincidencia<select name="matchType"><option value="CONTAINS"${editingRule?.matchType !== "EXACT" ? " selected" : ""}>Contiene el texto</option><option value="EXACT"${editingRule?.matchType === "EXACT" ? " selected" : ""}>Exacta</option></select></label></div><label data-rule-family-field>Familia<select name="familyId"><option value="">Selecciona una familia</option>${selectedFamilyOptions}</select></label><label data-rule-category-field>Categoría<select name="categoryName"><option value="">Selecciona una categoría</option>${categoryOptions}</select></label><label>Prioridad<input name="priority" type="number" min="0" max="9999" value="${editingRule?.priority ?? 100}"></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions">${editingRule ? `<button class="secondary-button" type="button" data-rule-cancel>Cancelar edición</button>` : ""}<button class="primary-button" type="submit">${editingRule ? "Guardar cambios" : "Guardar regla"}</button></div></form>`);
  const form = document.querySelector("#reconciliation-rule-form");
  const targetSelect = form?.querySelector("[name='targetType']");
  const syncTarget = () => { const family = form.querySelector("[data-rule-family-field]"); const category = form.querySelector("[data-rule-category-field]"); const isFamily = targetSelect.value === "family"; family.hidden = !isFamily; category.hidden = isFamily; family.querySelector("select").disabled = !isFamily; category.querySelector("select").disabled = isFamily; };
  targetSelect?.addEventListener("change", syncTarget); syncTarget();
  form?.addEventListener("submit", async (event) => {
    event.preventDefault(); const values = new FormData(form); const error = form.querySelector(".form-error"); const isFamily = values.get("targetType") === "family";
    try {
      const payload = { id: values.get("id") || undefined, pattern: values.get("pattern"), matchType: values.get("matchType"), familyId: isFamily ? values.get("familyId") : null, categoryId: null, categoryName: isFamily ? null : values.get("categoryName"), priority: Number(values.get("priority")) };
      if (!payload.familyId && !payload.categoryName) throw new Error("Selecciona el destino de la regla.");
      if (payload.id) await service.updateReconciliationRule(payload);
      else await service.createReconciliationRule(payload);
      await openBankRulesDialog(); showToast(payload.id ? "Regla actualizada." : "Regla guardada.");
    } catch (saveError) { error.textContent = saveError.message || "No se ha podido guardar la regla."; error.hidden = false; }
  });
  document.querySelector("[data-rule-cancel]")?.addEventListener("click", () => openBankRulesDialog());
  document.querySelectorAll("[data-rule-edit]").forEach((button) => button.addEventListener("click", () => openBankRulesDialog(button.dataset.ruleEdit)));
  document.querySelectorAll("[data-rule-toggle]").forEach((input) => input.addEventListener("change", async () => { try { await service.setReconciliationRuleActive(input.dataset.ruleToggle, input.checked); bankRules = await service.listReconciliationRules(); input.nextElementSibling.textContent = input.checked ? "Activa" : "Inactiva"; } catch (error) { input.checked = !input.checked; showToast(error.message); } }));
  document.querySelectorAll("[data-rule-delete]").forEach((button) => button.addEventListener("click", async () => { if (!window.confirm("¿Eliminar esta regla de conciliación?")) return; try { await service.deleteReconciliationRule(button.dataset.ruleDelete); bankRules = bankRules.filter((rule) => rule.id !== button.dataset.ruleDelete); await openBankRulesDialog(); showToast("Regla eliminada."); } catch (error) { showToast(error.message); } }));
}

function openBankMovementDialog(movementId) {
  if (!isAdministrator()) return;
  const movement = (data.bankMovements ?? []).find((item) => item.id === movementId);
  if (!movement) {
    showToast("No encontramos ese movimiento.");
    return;
  }
  const kind = movement.amountCents >= 0 ? "Ingreso" : "Salida";
  openDialog(`${dialogHeader("Conciliación bancaria", "Revisar movimiento")}
    <form class="dialog-form" id="bank-movement-form">
      <input type="hidden" name="id" value="${escapeHtml(movement.id)}">
      <div class="bank-movement-detail"><span>${kind} · ${formatDate(movement.date)}</span><strong>${escapeHtml(movement.concept)}</strong><b>${movement.amountCents >= 0 ? "+" : ""}${formatMoney(movement.amountCents)}</b></div>
      <label>Asignar a
        <select name="assignment">
          <option value="">Sin asignar</option>
          ${bankAssignmentOptions(movement, true)}
        </select>
      </label>
      <small>${movement.amountCents >= 0 ? "Los ingresos se asignan a una familia." : "Las salidas se asignan a una categoría o a un gasto ya registrado."}</small>
      <label>Nota opcional<textarea name="notes" maxlength="300" placeholder="Añade una aclaración si hace falta">${escapeHtml(movement.notes ?? "")}</textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">Guardar asignación</button></div>
    </form>`);
}

function bankAssignmentValue(item) {
  if (item.familyId) return `FAMILY:${item.familyId}`;
  if (item.categoryName) return `CATEGORY:${item.categoryName}`;
  if (item.expenseId) return `EXPENSE:${item.expenseId}`;
  return item.assignment ?? "";
}

function bankAssignmentOptions(item, includeExpenses = false) {
  const current = bankAssignmentValue(item);
  const option = (value, label) => `<option value="${escapeHtml(value)}"${current === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
  if (item.amountCents >= 0) {
    return data.families.filter((family) => family.active).map((family) => option(`FAMILY:${family.id}`, family.name)).join("");
  }
  const categories = data.expenseCategories.map((category) => option(`CATEGORY:${category.name}`, category.name)).join("");
  const expenses = includeExpenses ? data.expenses.filter((expense) => !expense.createdFromBank).map((expense) => option(`EXPENSE:${expense.id}`, `${expense.concept} · ${formatMoney(expense.amountCents)}`)).join("") : "";
  return `${categories}${expenses ? `<optgroup label="Gastos ya registrados">${expenses}</optgroup>` : ""}`;
}

function bankAssignmentLabel(item) {
  const family = data.families.find((entry) => entry.id === item.familyId);
  const expense = data.expenses.find((entry) => entry.id === item.expenseId);
  if (family) return `Familia: ${family.name}`;
  if (item.categoryName) return `Categoría: ${item.categoryName}`;
  if (expense) return `Gasto: ${expense.concept}`;
  return "Sin asignar";
}

function renderBank() {
  const allMovements = data.bankMovements ?? [];
  const pendingCount = allMovements.filter((item) => item.assignmentStatus === "PENDIENTE").length;
  const movements = bankMovementFilter === "pending" ? allMovements.filter((item) => item.assignmentStatus === "PENDIENTE") : allMovements;
  const summary = bankPreview ? `<section class="inline-summary"><div><span>Filas detectadas</span><strong>${bankPreview.records.length + bankPreview.errors.length}</strong></div><div><span>Nuevos</span><strong>${bankPreview.records.filter((item) => !item.duplicate).length}</strong></div><div><span>Duplicados</span><strong>${bankPreview.records.filter((item) => item.duplicate).length}</strong></div><div><span>Errores</span><strong>${bankPreview.errors.length}</strong></div></section>` : "";
  const conciliationRows = bankPreview ? bankPreview.records.map((item, index) => item.duplicate
    ? `<article class="bank-preview-row is-duplicate"><div><strong>${escapeHtml(item.concept)}</strong><small>${formatDate(item.date)} · ${item.duplicateReason === "existing" ? "Ya estaba importado" : "Repetido en este archivo"}</small></div><strong>${item.amountCents >= 0 ? "+" : ""}${formatMoney(item.amountCents)}</strong><span>Duplicado</span></article>`
    : `<article class="bank-preview-row"><div><strong>${escapeHtml(item.concept)}</strong><small>${formatDate(item.date)} · ${item.amountCents >= 0 ? "Ingreso" : "Gasto"}</small></div><select data-bank-assignment="${index}" aria-label="Asignación de ${escapeHtml(item.concept)}"><option value=""${bankAssignmentValue(item) ? "" : " selected"}>Sin asignar</option>${bankAssignmentOptions(item)}</select><strong>${item.amountCents >= 0 ? "+" : ""}${formatMoney(item.amountCents)}</strong></article>`).join("") : "";
  const errorRows = bankPreview ? bankPreview.errors.map((item) => `<article class="bank-preview-row is-error"><div><strong>Fila ${item.rowNumber}</strong><small>${escapeHtml(item.message)}</small></div><span>Error</span></article>`).join("") : "";
  const conciliation = bankPreview ? `<section class="list-section"><div class="list-section__heading"><div><p class="section-kicker">Previsualización y conciliación</p><h3>Revisa el extracto antes de guardarlo</h3></div></div>${summary}<div class="bank-preview-list">${conciliationRows}${errorRows}</div><div class="page-actions"><button class="secondary-button" type="button" data-cancel-bank-preview>Cancelar</button><button class="primary-button" type="button" data-confirm-bank-import${bankPreview.records.every((item) => item.duplicate) ? " disabled" : ""}>Confirmar conciliación e importar</button></div></section>` : "";
  const history = `<section class="list-section"><div class="list-section__heading"><div><p class="section-kicker">Cuenta común</p><h3>Movimientos bancarios</h3></div>${isAdministrator() && pendingCount ? `<button class="secondary-button" type="button" data-apply-bank-rules>${icon("settings")} Aplicar reglas</button>` : ""}</div><div class="filter-chips" aria-label="Filtrar movimientos"><button class="filter-chip${bankMovementFilter === "pending" ? " is-active" : ""}" type="button" data-bank-filter="pending">Pendientes · ${pendingCount}</button><button class="filter-chip${bankMovementFilter === "all" ? " is-active" : ""}" type="button" data-bank-filter="all">Todos · ${allMovements.length}</button></div><div class="bank-preview-list">${movements.length ? movements.map((item) => `<article class="bank-preview-row${item.assignmentStatus === "PENDIENTE" ? " is-error" : ""}"><div><strong>${escapeHtml(item.concept)}</strong><small>${formatDate(item.date)} · ${escapeHtml(bankAssignmentLabel(item))}</small></div><strong>${item.amountCents >= 0 ? "+" : ""}${formatMoney(item.amountCents)}</strong>${isAdministrator() ? `<button class="bank-review-button" type="button" data-edit-bank-movement="${escapeHtml(item.id)}">${item.assignmentStatus === "PENDIENTE" ? "Revisar" : "Editar"}</button>` : `<span>${item.assignmentStatus === "PENDIENTE" ? "Pendiente" : "Asignado"}</span>`}</article>`).join("") : `<div class="empty-list"><strong>${bankMovementFilter === "pending" ? "No hay movimientos pendientes." : "Aún no hay movimientos importados."}</strong><span>${bankMovementFilter === "pending" ? "Todas las operaciones tienen destino." : "Añade un extracto para comenzar."}</span></div>`}</div></section>`;
  const importHistory = isAdministrator() && (data.bankImportBatches ?? []).length ? `<section class="list-section"><div class="list-section__heading"><div><p class="section-kicker">Control de importaciones</p><h3>Histórico de extractos</h3></div></div><div class="import-history">${data.bankImportBatches.map((batch) => `<article><div><strong>${escapeHtml(batch.source)}</strong><small>${formatDate(String(batch.createdAt).slice(0, 10))} · ${batch.importedCount} nuevos · ${batch.duplicateCount} duplicados</small></div><button class="text-button danger-text" type="button" data-revert-bank-import="${escapeHtml(batch.id)}">Revertir</button></article>`).join("")}</div></section>` : "";
  return `${conciliation}${history}${importHistory}<aside class="info-note">${icon("bank")}<p><strong>La conciliación actualiza las cuentas.</strong> Una familia recibe una aportación y una categoría crea el gasto correspondiente; después siempre puedes corregir la asignación.</p></aside>`;
}

const proposalStatuses = {
  IDEA: "Idea",
  EN_ESTUDIO: "En estudio",
  PENDIENTE_VOTACION: "Pendiente de votación",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  EN_EJECUCION: "En ejecución",
  FINALIZADA: "Finalizada"
};

function proposalStatusLabel(status) {
  return proposalStatuses[status] ?? "Idea";
}

const voteLabels = { FAVOR: "A favor", CONTRA: "En contra", ABSTENCION: "Abstención" };

function proposalVotingMarkup(proposal) {
  const voting = proposal.voting;
  if (!voting) return `<section class="proposal-voting"><div class="dialog-section-heading"><div><span>Decisión de la comunidad</span><strong>Votación</strong></div>${isAdministrator() ? `<button class="secondary-button" type="button" data-set-proposal-voting="ABIERTA" data-proposal="${escapeHtml(proposal.id)}">Abrir votación</button>` : ""}</div><p class="empty-copy">La votación todavía no está abierta.</p><small class="voting-disclaimer">Herramienta organizativa interna; no sustituye los requisitos legales de una junta.</small></section>`;
  const votes = voting.votes ?? [];
  const counts = Object.fromEntries(Object.keys(voteLabels).map((key) => [key, votes.filter((item) => item.vote === key).length]));
  const familyRows = (data.families ?? []).filter((family) => family.active).map((family) => {
    const saved = votes.find((vote) => vote.familyId === family.id);
    return `<li><span>${escapeHtml(family.name)}</span><strong class="${saved ? "has-voted" : "has-not-voted"}">${saved ? escapeHtml(voteLabels[saved.vote] ?? saved.vote) : "Sin voto"}</strong></li>`;
  }).join("");
  const voteForm = voting.status === "ABIERTA" ? `<form class="voting-form" id="proposal-vote-form"><input type="hidden" name="proposalId" value="${escapeHtml(proposal.id)}"><label>Familia<select name="familyId" required><option value="" selected disabled>Elige tu familia</option>${(data.families ?? []).filter((family) => family.active).map((family) => `<option value="${escapeHtml(family.id)}">${escapeHtml(family.name)}</option>`).join("")}</select></label><label>Decisión<select name="vote" required><option value="FAVOR">A favor</option><option value="CONTRA">En contra</option><option value="ABSTENCION">Abstención</option></select></label><button class="primary-button" type="submit">Guardar voto</button><p class="form-error" role="alert" hidden></p></form>` : `<p class="voting-closed">Votación cerrada el ${formatDate(String(voting.closedAt).slice(0, 10))}. El resultado queda conservado.</p>`;
  return `<section class="proposal-voting"><div class="dialog-section-heading"><div><span>Decisión de la comunidad</span><strong>Votación ${voting.status === "ABIERTA" ? "abierta" : "cerrada"}</strong></div>${isAdministrator() && voting.status === "ABIERTA" ? `<button class="secondary-button" type="button" data-set-proposal-voting="CERRADA" data-proposal="${escapeHtml(proposal.id)}">Cerrar votación</button>` : ""}</div><div class="vote-summary"><div><strong>${counts.FAVOR}</strong><span>A favor</span></div><div><strong>${counts.CONTRA}</strong><span>En contra</span></div><div><strong>${counts.ABSTENCION}</strong><span>Abstenciones</span></div></div><ul class="family-vote-list">${familyRows}</ul>${voteForm}<small class="voting-disclaimer">Selecciona expresamente la familia. El acceso compartido no identifica a una persona ni a una familia.</small></section>`;
}

function renderProposals() {
  const proposals = data.proposals ?? [];
  const budgetCount = sumCents(proposals, (proposal) => (proposal.budgets ?? []).length);
  const inProgress = proposals.filter((proposal) => ["EN_ESTUDIO", "PENDIENTE_VOTACION", "EN_EJECUCION"].includes(proposal.status)).length;
  const approved = proposals.filter((proposal) => ["APROBADA", "FINALIZADA"].includes(proposal.status)).length;
  return `<section class="inline-summary" aria-label="Resumen de propuestas"><div><span>Total</span><strong>${proposals.length}</strong></div><div><span>En marcha</span><strong>${inProgress}</strong></div><div><span>Aprobadas</span><strong>${approved}</strong></div><div><span>Presupuestos</span><strong>${budgetCount}</strong></div></section>
    <section class="proposal-grid" aria-label="Listado de propuestas">${proposals.length ? proposals.map((proposal) => {
      const budgets = proposal.budgets ?? [];
      const lowestBudget = budgets.length ? Math.min(...budgets.map((budget) => budget.amountCents)) : null;
      return `<button class="proposal-card" type="button" data-proposal-id="${escapeHtml(proposal.id)}"><span class="proposal-card__top"><span class="proposal-status proposal-status--${proposal.status.toLowerCase()}">${escapeHtml(proposalStatusLabel(proposal.status))}</span><small>${formatDate(proposal.date)}</small></span><strong>${escapeHtml(proposal.title)}</strong><span class="proposal-card__description">${escapeHtml(proposal.description)}</span><span class="proposal-card__bottom"><span><small>${budgets.length ? `${budgets.length} ${budgets.length === 1 ? "presupuesto" : "presupuestos"}` : "Sin presupuestos"}</small><b>${lowestBudget === null ? (proposal.estimatedBudgetCents === null ? "Por valorar" : `Estimado ${formatMoney(proposal.estimatedBudgetCents)}`) : `Desde ${formatMoney(lowestBudget)}`}</b></span>${icon("arrow")}</span></button>`;
    }).join("") : `<div class="empty-list"><strong>Aún no hay propuestas.</strong><span>Añade una idea para que la comunidad pueda estudiarla.</span></div>`}</section>`;
}

function openProposalForm(proposal = null) {
  const canEditStatus = isAdministrator() && proposal;
  const statusOptions = Object.entries(proposalStatuses).map(([value, label]) => `<option value="${value}"${proposal?.status === value ? " selected" : ""}>${label}</option>`).join("");
  openDialog(`${dialogHeader(proposal ? "Editar propuesta" : "Nueva propuesta", proposal ? escapeHtml(proposal.title) : "Compartir una idea")}
    <form class="dialog-form" id="proposal-form"><input type="hidden" name="id" value="${escapeHtml(proposal?.id ?? "")}"><label>Título<input name="title" required minlength="3" maxlength="120" value="${escapeHtml(proposal?.title ?? "")}" placeholder="¿Qué propones?"></label><label>Descripción<textarea name="description" required minlength="3" maxlength="5000" placeholder="Explícalo de forma sencilla">${escapeHtml(proposal?.description ?? "")}</textarea></label><div class="form-row"><label>Fecha<input name="date" required type="date" value="${proposal?.date ?? todayIso()}"></label><label>Presupuesto estimado (€)<input name="estimatedBudget" inputmode="decimal" value="${proposal?.estimatedBudgetCents == null ? "" : centsInputValue(proposal.estimatedBudgetCents)}" placeholder="Opcional"></label></div>${canEditStatus ? `<label>Estado<select name="status">${statusOptions}</select></label>` : ""}<label>Notas<textarea name="notes" maxlength="1000">${escapeHtml(proposal?.notes ?? "")}</textarea></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${proposal ? "Guardar cambios" : "Crear propuesta"}</button></div></form>`);
}

function openProposalDetail(proposalId) {
  const proposal = (data.proposals ?? []).find((item) => item.id === proposalId);
  if (!proposal) return showToast("No encontramos esa propuesta.");
  const budgets = proposal.budgets ?? [];
  openDialog(`${dialogHeader("Propuesta", escapeHtml(proposal.title))}<div class="proposal-detail"><div class="proposal-detail__meta"><span class="proposal-status proposal-status--${proposal.status.toLowerCase()}">${escapeHtml(proposalStatusLabel(proposal.status))}</span><span>${formatDate(proposal.date)}</span></div><p>${escapeHtml(proposal.description)}</p>${proposal.estimatedBudgetCents == null ? "" : `<div class="quota-calculation"><span>Estimación inicial</span><strong>${formatMoney(proposal.estimatedBudgetCents)}</strong></div>`}<div class="dialog-section-heading"><div><span>Comparación</span><strong>Presupuestos</strong></div><button class="secondary-button" type="button" data-add-proposal-budget="${escapeHtml(proposal.id)}">${icon("plus")} Añadir</button></div><div class="proposal-budget-list">${budgets.length ? budgets.map((budget) => `<article><div><strong>${escapeHtml(budget.provider)}</strong><small>${formatDate(budget.date)}${budget.description ? ` · ${escapeHtml(budget.description)}` : ""}</small></div><b>${formatMoney(budget.amountCents)}</b>${isAdministrator() ? `<button class="icon-button" type="button" data-delete-proposal-budget="${escapeHtml(budget.id)}" data-proposal="${escapeHtml(proposal.id)}" aria-label="Eliminar presupuesto">${icon("trash")}</button>` : ""}</article>`).join("") : `<p class="empty-copy">Todavía no se ha añadido ningún presupuesto.</p>`}</div>${proposalVotingMarkup(proposal)}${proposal.notes ? `<p class="family-note"><strong>Notas:</strong> ${escapeHtml(proposal.notes)}</p>` : ""}<div class="dialog-actions">${isAdministrator() ? `<button class="text-button danger-text" type="button" data-delete-proposal="${escapeHtml(proposal.id)}">Eliminar</button><button class="secondary-button" type="button" data-edit-proposal="${escapeHtml(proposal.id)}">Editar propuesta</button>` : ""}<button class="primary-button" type="button" data-close-dialog>Cerrar</button></div></div>`);
}

function openProposalBudgetForm(proposalId) {
  const proposal = (data.proposals ?? []).find((item) => item.id === proposalId);
  if (!proposal) return showToast("No encontramos esa propuesta.");
  openDialog(`${dialogHeader("Nuevo presupuesto", escapeHtml(proposal.title))}<form class="dialog-form" id="proposal-budget-form"><input type="hidden" name="proposalId" value="${escapeHtml(proposal.id)}"><div class="form-row"><label>Proveedor<input name="provider" required minlength="2" maxlength="120"></label><label>Importe (€)<input name="amount" required inputmode="decimal"></label></div><label>Descripción<input name="description" maxlength="300" placeholder="Qué incluye"></label><label>Fecha<input name="date" required type="date" value="${todayIso()}"></label><label>Notas<textarea name="notes" maxlength="1000"></textarea></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-proposal-back="${escapeHtml(proposal.id)}">Cancelar</button><button class="primary-button" type="submit">Guardar presupuesto</button></div></form>`);
}

const meetingStatusLabels = { PLANIFICADA: "Planificada", CELEBRADA: "Celebrada", CANCELADA: "Cancelada" };

function renderMeetings() {
  const meetings = [...(data.meetings ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  const planned = meetings.filter((meeting) => meeting.status === "PLANIFICADA");
  const next = [...planned].filter((meeting) => meeting.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
  const agendaCount = sumCents(meetings, (meeting) => (meeting.agenda ?? []).length);
  return `<section class="inline-summary" aria-label="Resumen de reuniones"><div><span>Próxima</span><strong>${next ? formatDate(next.date) : "Sin fecha"}</strong></div><div><span>Planificadas</span><strong>${planned.length}</strong></div><div><span>Celebradas</span><strong>${meetings.filter((meeting) => meeting.status === "CELEBRADA").length}</strong></div><div><span>Puntos preparados</span><strong>${agendaCount}</strong></div></section><section class="meeting-list" aria-label="Reuniones">${meetings.length ? meetings.map((meeting) => `<button class="meeting-card" type="button" data-meeting-id="${escapeHtml(meeting.id)}"><span class="meeting-card__date"><strong>${meeting.date.slice(8, 10)}</strong><small>${new Intl.DateTimeFormat("es-ES", { month: "short" }).format(new Date(`${meeting.date}T12:00:00`))}</small></span><span class="meeting-card__copy"><strong>${formatDate(meeting.date)} · ${escapeHtml(meeting.time)}</strong><small>${escapeHtml(meeting.place)} · ${(meeting.agenda ?? []).length} ${(meeting.agenda ?? []).length === 1 ? "punto" : "puntos"}</small></span><span class="proposal-status proposal-status--${meeting.status.toLowerCase()}">${escapeHtml(meetingStatusLabels[meeting.status] ?? meeting.status)}</span>${icon("arrow")}</button>`).join("") : `<div class="empty-list"><strong>Aún no hay reuniones.</strong><span>Administración puede programar la primera.</span></div>`}</section>`;
}

function openMeetingForm(meeting = null) {
  const statuses = Object.entries(meetingStatusLabels).map(([value, label]) => `<option value="${value}"${meeting?.status === value ? " selected" : ""}>${label}</option>`).join("");
  openDialog(`${dialogHeader(meeting ? "Editar reunión" : "Nueva reunión", meeting ? formatDate(meeting.date) : "Programar encuentro")}<form class="dialog-form" id="meeting-form"><input type="hidden" name="id" value="${escapeHtml(meeting?.id ?? "")}"><div class="form-row"><label>Fecha<input name="date" type="date" required value="${meeting?.date ?? todayIso()}"></label><label>Hora<input name="time" type="time" required value="${meeting?.time ?? "18:30"}"></label></div><label>Lugar<input name="place" required minlength="2" maxlength="160" value="${escapeHtml(meeting?.place ?? "")}" placeholder="Zona común"></label>${meeting ? `<label>Estado<select name="status">${statuses}</select></label>` : ""}<label>Notas<textarea name="notes" maxlength="1000">${escapeHtml(meeting?.notes ?? "")}</textarea></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${meeting ? "Guardar cambios" : "Crear reunión"}</button></div></form>`);
}

function openAgendaItemForm(meetingId, item = null) {
  const proposalOptions = (data.proposals ?? []).map((proposal) => `<option value="${escapeHtml(proposal.id)}"${item?.proposalId === proposal.id ? " selected" : ""}>${escapeHtml(proposal.title)}</option>`).join("");
  openDialog(`${dialogHeader(item ? "Editar punto" : "Nuevo punto", "Orden del día")}<form class="dialog-form" id="agenda-item-form"><input type="hidden" name="id" value="${escapeHtml(item?.id ?? "")}"><input type="hidden" name="meetingId" value="${escapeHtml(meetingId)}"><label>Título<input name="title" required minlength="3" maxlength="180" value="${escapeHtml(item?.title ?? "")}"></label><label>Descripción<textarea name="description" maxlength="3000">${escapeHtml(item?.description ?? "")}</textarea></label><label>Propuesta relacionada<select name="proposalId"><option value="">Ninguna</option>${proposalOptions}</select></label><label>Notas<textarea name="notes" maxlength="1000">${escapeHtml(item?.notes ?? "")}</textarea></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-meeting-back="${escapeHtml(meetingId)}">Cancelar</button><button class="primary-button" type="submit">Guardar punto</button></div></form>`);
}

const minutesStatusLabels = { BORRADOR: "Borrador", REVISADA: "Revisada", CERRADA: "Cerrada" };

function meetingMinutesMarkup(meeting) {
  const minutes = meeting.minutes;
  if (!minutes) return `<section class="minutes-section"><div class="dialog-section-heading"><div><span>Después de la reunión</span><strong>Acta</strong></div>${isAdministrator() ? `<button class="secondary-button" type="button" data-create-minutes="${escapeHtml(meeting.id)}">Crear borrador</button>` : ""}</div><p class="empty-copy">Esta reunión todavía no tiene acta.</p></section>`;
  const closed = minutes.status === "CERRADA";
  const attendees = minutes.attendees ?? [];
  return `<section class="minutes-section"><div class="dialog-section-heading"><div><span>Documento de la reunión</span><strong>Acta · ${escapeHtml(minutesStatusLabels[minutes.status] ?? minutes.status)}</strong></div>${isAdministrator() && !closed ? `<button class="secondary-button" type="button" data-edit-minutes="${escapeHtml(minutes.id)}" data-meeting="${escapeHtml(meeting.id)}">Asistentes y resumen</button>` : ""}</div><div class="minutes-overview"><div><span>Asistentes</span><strong>${attendees.length ? attendees.map((item) => escapeHtml(item.familyName)).join(", ") : "Sin indicar"}</strong></div>${minutes.content ? `<p>${escapeHtml(minutes.content)}</p>` : ""}</div><div class="minutes-items">${(minutes.items ?? []).length ? minutes.items.map((item) => `<article><div class="minutes-item__heading"><span>${item.position}</span><strong>${escapeHtml(item.subject)}</strong>${isAdministrator() && !closed ? `<button class="icon-button" type="button" data-edit-minutes-item="${escapeHtml(item.id)}" data-meeting="${escapeHtml(meeting.id)}" aria-label="Editar punto del acta">${icon("edit")}</button>` : ""}</div><dl><div><dt>Resumen</dt><dd>${item.summary ? escapeHtml(item.summary) : "Pendiente"}</dd></div><div><dt>Decisión</dt><dd>${item.decision ? escapeHtml(item.decision) : "Pendiente"}</dd></div></dl>${item.votingResult ? `<small>Votación: ${Number(item.votingResult.favor ?? 0)} a favor · ${Number(item.votingResult.contra ?? 0)} en contra · ${Number(item.votingResult.abstencion ?? 0)} abstenciones</small>` : ""}</article>`).join("") : `<p class="empty-copy">El acta no tiene puntos porque el orden del día estaba vacío.</p>`}</div>${isAdministrator() && !closed ? `<div class="minutes-actions"><button class="primary-button" type="button" data-close-minutes="${escapeHtml(minutes.id)}" data-meeting="${escapeHtml(meeting.id)}">Cerrar acta</button><small>Para cerrar, completa asistentes, resumen y decisión de todos los puntos.</small></div>` : closed ? `<p class="minutes-closed">Acta cerrada el ${formatDate(String(minutes.closedAt).slice(0, 10))}. Se conserva sin modificaciones accidentales.</p>` : ""}</section>`;
}

function openMinutesForm(meetingId) {
  const meeting = (data.meetings ?? []).find((item) => item.id === meetingId); const minutes = meeting?.minutes;
  if (!minutes) return showToast("No encontramos el acta.");
  const selected = new Set((minutes.attendees ?? []).map((item) => item.familyId));
  openDialog(`${dialogHeader("Acta", "Asistentes y resumen")}<form class="dialog-form" id="minutes-form"><input type="hidden" name="id" value="${escapeHtml(minutes.id)}"><input type="hidden" name="meetingId" value="${escapeHtml(meeting.id)}"><fieldset class="family-selector"><legend>Familias asistentes</legend>${(data.families ?? []).filter((family) => family.active).map((family) => `<label><input type="checkbox" name="attendee" value="${escapeHtml(family.id)}"${selected.has(family.id) ? " checked" : ""}><span>${escapeHtml(family.name)}</span></label>`).join("")}</fieldset><label>Resumen general<textarea name="content" maxlength="5000">${escapeHtml(minutes.content ?? "")}</textarea></label><label>Estado<select name="status"><option value="BORRADOR"${minutes.status === "BORRADOR" ? " selected" : ""}>Borrador</option><option value="REVISADA"${minutes.status === "REVISADA" ? " selected" : ""}>Revisada</option></select></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-meeting-back="${escapeHtml(meeting.id)}">Cancelar</button><button class="primary-button" type="submit">Guardar acta</button></div></form>`);
}

function openMinutesItemForm(meetingId, itemId) {
  const meeting = (data.meetings ?? []).find((value) => value.id === meetingId); const item = meeting?.minutes?.items?.find((value) => value.id === itemId);
  if (!item) return showToast("No encontramos el punto del acta.");
  openDialog(`${dialogHeader("Punto del acta", escapeHtml(item.subject))}<form class="dialog-form" id="minutes-item-form"><input type="hidden" name="id" value="${escapeHtml(item.id)}"><input type="hidden" name="meetingId" value="${escapeHtml(meeting.id)}"><label>Resumen de lo tratado<textarea name="summary" required maxlength="5000">${escapeHtml(item.summary ?? "")}</textarea></label><label>Decisión<textarea name="decision" required maxlength="5000">${escapeHtml(item.decision ?? "")}</textarea></label><label>Observaciones<textarea name="observations" maxlength="2000">${escapeHtml(item.observations ?? "")}</textarea></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-meeting-back="${escapeHtml(meeting.id)}">Cancelar</button><button class="primary-button" type="submit">Guardar punto</button></div></form>`);
}

function openMeetingDetail(meetingId) {
  const meeting = (data.meetings ?? []).find((item) => item.id === meetingId);
  if (!meeting) return showToast("No encontramos esa reunión.");
  const agenda = meeting.agenda ?? [];
  openDialog(`${dialogHeader("Reunión", `${formatDate(meeting.date)} · ${escapeHtml(meeting.time)}`)}<div class="meeting-detail"><div class="meeting-detail__summary"><span class="proposal-status proposal-status--${meeting.status.toLowerCase()}">${escapeHtml(meetingStatusLabels[meeting.status])}</span><strong>${escapeHtml(meeting.place)}</strong></div><div class="dialog-section-heading"><div><span>Temas a tratar</span><strong>Orden del día</strong></div>${isAdministrator() && meeting.minutes?.status !== "CERRADA" ? `<button class="secondary-button" type="button" data-add-agenda-item="${escapeHtml(meeting.id)}">${icon("plus")} Añadir punto</button>` : ""}</div><ol class="agenda-list">${agenda.length ? agenda.map((item, index) => `<li><span class="agenda-list__number">${item.position}</span><div><strong>${escapeHtml(item.title)}</strong>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}${item.proposalTitle ? `<small>Propuesta: ${escapeHtml(item.proposalTitle)}</small>` : ""}</div>${isAdministrator() && meeting.minutes?.status !== "CERRADA" ? `<div class="agenda-list__actions"><button type="button" data-move-agenda="up" data-item="${escapeHtml(item.id)}" data-meeting="${escapeHtml(meeting.id)}"${index === 0 ? " disabled" : ""} aria-label="Subir punto">↑</button><button type="button" data-move-agenda="down" data-item="${escapeHtml(item.id)}" data-meeting="${escapeHtml(meeting.id)}"${index === agenda.length - 1 ? " disabled" : ""} aria-label="Bajar punto">↓</button><button class="icon-button" type="button" data-edit-agenda-item="${escapeHtml(item.id)}" data-meeting="${escapeHtml(meeting.id)}" aria-label="Editar punto">${icon("edit")}</button><button class="icon-button" type="button" data-delete-agenda-item="${escapeHtml(item.id)}" data-meeting="${escapeHtml(meeting.id)}" aria-label="Eliminar punto">${icon("trash")}</button></div>` : ""}</li>`).join("") : `<li class="agenda-list__empty">El orden del día todavía está vacío.</li>`}</ol>${meetingMinutesMarkup(meeting)}${meeting.notes ? `<p class="family-note"><strong>Notas:</strong> ${escapeHtml(meeting.notes)}</p>` : ""}<div class="dialog-actions">${isAdministrator() && meeting.minutes?.status !== "CERRADA" ? `<button class="text-button danger-text" type="button" data-delete-meeting="${escapeHtml(meeting.id)}">Eliminar</button><button class="secondary-button" type="button" data-edit-meeting="${escapeHtml(meeting.id)}">Editar reunión</button>` : ""}<button class="primary-button" type="button" data-close-dialog>Cerrar</button></div></div>`);
}

async function createBankPreview(rows, source) {
  const normalized = normalizeBankRows(rows, { source });
  if (isAdministrator()) { try { bankRules = await service.listReconciliationRules(); } catch { bankRules = []; } }
  const key = (value) => String(value ?? "").trim().toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const rules = [...bankRules].filter((rule) => rule.active).sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
  bankPreview = { ...normalized, records: detectBankDuplicates(normalized.records, data.bankMovements ?? []).map((record) => {
    const concept = key(record.concept);
    const rule = rules.find((item) => {
      const pattern = key(item.pattern);
      const matches = item.matchType === "EXACT" ? concept === pattern : concept.includes(pattern);
      const validTarget = record.amountCents > 0 ? Boolean(item.familyId) : Boolean(item.categoryName);
      return matches && validTarget;
    });
    return { ...record, assignment: rule?.familyId ? `FAMILY:${rule.familyId}` : rule?.categoryName ? `CATEGORY:${rule.categoryName}` : "" };
  }) };
  renderRoute();
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(value.trim()); value = "";
    } else value += character;
  }
  values.push(value.trim());
  return values;
}

function bankHeaderKey(value) {
  return String(value ?? "").trim().toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function rowsAfterBankHeader(rows) {
  const headerIndex = rows.findIndex((row) => row.some((value) => bankHeaderKey(value) === "fecha de operacion"));
  if (headerIndex < 0) throw new Error("No encontramos la fila de encabezados «Fecha de operación».");
  const headers = rows[headerIndex].map((item) => String(item ?? "").trim());
  return rows.slice(headerIndex + 1).filter((row) => row.some((value) => String(value ?? "").trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseCsvFile(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("El archivo está vacío.");
  for (const delimiter of [";", ",", "\t"]) {
    try { return rowsAfterBankHeader(lines.map((line) => parseCsvLine(line, delimiter))); }
    catch (error) { if (delimiter === "\t") throw error; }
  }
  return [];
}

async function parseBankFile(file) {
  if (file.name.toLowerCase().endsWith(".csv")) return parseCsvFile(await file.text());
  if (!globalThis.XLSX) throw new Error("No hemos podido iniciar el lector de Excel.");
  const workbook = globalThis.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error("El extracto no contiene ninguna hoja legible.");
  return rowsAfterBankHeader(globalThis.XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "", raw: false, dateNF: "dd/mm/yyyy" }));
}

function renderAdministration() {
  return `<section class="admin-grid"><article class="panel"><p class="section-kicker">Configuración</p><h2>Cuotas y agua</h2><p>Configura importes nuevos sin modificar las liquidaciones ya emitidas.</p><div class="page-actions"><button class="secondary-button" type="button" data-open-quota>${icon("coins")} Cuota anual</button><button class="secondary-button" type="button" data-open-water-tariff>${icon("water")} Tarifa de agua</button></div></article><article class="panel"><p class="section-kicker">Banco</p><h2>Reglas de conciliación</h2><p>Los conceptos repetidos se configuran aquí una sola vez para proponer su asignación automáticamente.</p><button class="secondary-button" type="button" data-open-bank-rules>${icon("settings")} Gestionar reglas${bankRules.length ? ` · ${bankRules.length}` : ""}</button></article><article class="panel"><p class="section-kicker">Accesos</p><h2>Credenciales</h2><p>La gestión de contraseñas administrativas se añadirá mediante una pantalla segura de servidor. Nunca se mostrarán ni guardarán en el navegador.</p></article></section>`;
}

function renderTopbar(route) {
  const plan = activeQuotaPlan();
  const contexts = {
    inicio: "Resumen de la comunidad",
    familias: `Aportaciones y cuota · ${plan.year}`,
    gastos: `Gastos y derramas · ${plan.year}`,
    agua: "Lecturas y liquidaciones",
    propuestas: "Ideas y presupuestos",
    reuniones: "Próximas reuniones y orden del día"
  };
  let actions = "";
  if (isAdministrator() && route.id === "familias") {
    actions = `<button class="primary-button" type="button" data-demo-add="familia" aria-label="Añadir familia">${icon("plus")}<span class="action-label">Añadir familia</span></button>`;
  }
  if (route.id === "gastos") {
    actions = `<button class="secondary-button" type="button" data-open-assessment aria-label="Nueva derrama">${icon("people")}<span class="action-label">Nueva derrama</span></button><button class="primary-button" type="button" data-open-expense aria-label="Añadir gasto">${icon("plus")}<span class="action-label">Añadir gasto</span></button>`;
  }
  if (route.id === "agua") {
    const readings = latestWaterReadings();
    const settlement = waterSettlementState().preview;
    const canSettle = isAdministrator() && settlement && settlement.totalUsageM3 > 0;
    actions = `${readings.length ? `<button class="secondary-button" type="button" data-open-water aria-label="Nueva lectura">${icon("plus")}<span class="action-label">Nueva lectura</span></button>` : ""}${isAdministrator() ? `<button class="primary-button" type="button" data-open-water-settlement aria-label="Liquidar agua"${canSettle ? "" : " disabled"}>${icon("coins")}<span class="action-label">Liquidar agua</span></button>` : ""}`;
  }
  if (route.id === "propuestas") {
    actions = `<button class="primary-button" type="button" data-open-proposal aria-label="Nueva propuesta">${icon("plus")}<span class="action-label">Nueva propuesta</span></button>`;
  }
  if (isAdministrator() && route.id === "reuniones") actions = `<button class="primary-button" type="button" data-open-meeting>${icon("plus")}<span class="action-label">Nueva reunión</span></button>`;
  if (isAdministrator() && route.id === "banco") {
    actions = `<label class="primary-button file-button" aria-label="Añadir extracto">${icon("plus")} ${icon("excel")}<span class="action-label">Añadir</span><input type="file" accept=".xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" data-bank-file></label>`;
  }
  document.querySelector("#page-title").textContent = route.label;
  document.querySelector("#page-context").textContent = contexts[route.id] ?? "Sección de la comunidad";
  document.querySelector("#topbar-actions").innerHTML = actions;
}

function renderRoute() {
  if (!data) return;
  const requestedRoute = location.hash.slice(1) || "inicio";
  const route = visibleRoutes().find((item) => item.id === requestedRoute) || routes[0];
  renderNavigation(route.id);
  renderTopbar(route);
  const renderers = { inicio: renderDashboard, familias: renderFamilies, banco: renderBank, gastos: renderExpenses, agua: renderWater, propuestas: renderProposals, reuniones: renderMeetings, administracion: renderAdministration };
  pageContent.innerHTML = renderers[route.id] ? renderers[route.id]() : renderPlaceholder(route.label);
  document.title = `${route.label} · Comunidad`;
  bindInteractions();
}

function showToast(message) {
  const region = document.querySelector("#toast-region");
  region.innerHTML = `<div class="toast">${icon("check")}<span>${message}</span></div>`;
  window.setTimeout(() => { region.innerHTML = ""; }, 2800);
}

function renderLogin({ message = "" } = {}) {
  document.body.classList.add("is-auth-view");
  loadingState.hidden = true;
  pageContent.hidden = false;
  pageContent.innerHTML = `<section class="auth-card" aria-labelledby="auth-title">
    <span class="auth-card__mark" aria-hidden="true"><img src="./assets/logo-dani-concept.png" alt=""></span>
    <p class="section-kicker">Nuestra comunidad</p>
    <h1 id="auth-title">Acceso a la comunidad</h1>
    <p>Escribe la contraseña de acceso de la comunidad.</p>
    <form class="auth-form" id="access-form">
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required autofocus></label>
      <label class="auth-remember"><input name="remember" type="checkbox" value="yes"> Recordar acceso en este dispositivo</label>
      <p class="form-error" role="alert"${message ? "" : " hidden"}>${message}</p>
      <button class="primary-button" type="submit">Entrar</button>
    </form>
    <small>La contraseña se comprueba de forma segura y no se guarda en el dispositivo.</small>
  </section>`;
  bindAuthInteractions();
}

function setFormBusy(form, busy, label) {
  const button = form.querySelector("button[type='submit']");
  form.toggleAttribute("aria-busy", busy);
  button.disabled = busy;
  button.textContent = label;
}

function bindAuthInteractions() {
  document.querySelector("#access-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".form-error");
    setFormBusy(form, true, "Comprobando…");
    try {
      const values = new FormData(form);
      await authService.unlock(values.get("password"), values.get("remember") === "yes");
      await loadPanel();
    } catch (accessError) {
      error.textContent = accessError.message;
      error.hidden = false;
      setFormBusy(form, false, "Entrar");
    }
  });
}

function openDialog(content) {
  const dialog = document.querySelector("#app-dialog");
  document.querySelector("#dialog-content").innerHTML = content;
  dialog.scrollTop = 0;
  dialog.showModal();
  dialog.querySelector("[data-close-dialog]")?.focus();
  bindDialogInteractions();
}

function dialogHeader(kicker, title) {
  return `<div class="dialog-header"><div><p class="section-kicker">${kicker}</p><h2 id="dialog-title">${title}</h2></div><button class="icon-button" type="button" data-close-dialog aria-label="Cerrar">${icon("close")}</button></div>`;
}

function openFamilyDialog(familyId) {
  const family = data.families.find((item) => item.id === familyId);
  const plan = activeQuotaPlan();
  const account = familyAccount(family.id);
  const status = familyAccountStatus(account);
  const ledgerEntries = familyLedgerEntries(family.id);
  const water = data.waterReadings.filter((reading) => reading.familyId === family.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  openDialog(`${dialogHeader("Ficha de familia", escapeHtml(family.name))}
    <div class="dialog-family-summary">
      <div class="detail-highlight"><span class="family-avatar">${escapeHtml(familyMonogram(family))}</span><div><strong>Total aportado: ${formatMoney(account.contributionsCents)}</strong><span>${status.label} · ${family.members} miembros</span></div></div>
      <div class="detail-grid"><div><span>Aplicado a cuota</span><strong>${formatMoney(account.quotaCoveredCents)}</strong></div><div><span>Aportación extra</span><strong>${formatMoney(account.extraContributionsCents)}</strong></div><div><span>Cuota prevista a fecha</span><strong>${formatMoney(account.quotaChargesCents)}</strong></div><div><span>${account.balanceCents < 0 ? "Pendiente tras liquidaciones" : "Disponible tras liquidaciones"}</span><strong>${formatMoney(Math.abs(account.balanceCents))}</strong></div><div><span>Agua liquidada</span><strong>${formatMoney(account.waterChargesCents)}</strong></div><div><span>Derramas</span><strong>${formatMoney(account.assessmentChargesCents)}</strong></div><div><span>Gastos adelantados</span><strong>${formatMoney(account.advanceCreditsCents)}</strong></div><div><span>Última lectura</span><strong>${water ? `${formatDecimal(water.readingM3)} m³` : "Sin lectura"}</strong></div></div>
      <div class="dialog-section-heading"><div><span>Cuenta ${plan.year}</span><strong>Últimos movimientos</strong></div><button class="secondary-button" type="button" data-add-contribution="${escapeHtml(family.id)}">Registrar aportación</button></div>
      <div class="contribution-list">${ledgerEntries.length ? ledgerEntries.slice(0, 10).map((entry) => `<div><span><strong>${escapeHtml(entry.concept)}</strong><small>${formatDate(entry.date)} · ${escapeHtml(entry.type)}</small></span><strong class="ledger-amount ${entry.amountCents >= 0 ? "is-credit" : "is-charge"}">${entry.amountCents >= 0 ? "+" : ""}${formatMoney(entry.amountCents)}</strong></div>`).join("") : `<p class="empty-copy">Todavía no hay movimientos registrados.</p>`}</div>
      ${family.notes ? `<p class="family-note"><strong>Observación:</strong> ${escapeHtml(family.notes)}</p>` : ""}
    </div>`);
}

function openContributionDialog(familyId) {
  const family = data.families.find((item) => item.id === familyId);
  openDialog(`${dialogHeader("Aportación", `Registrar para ${escapeHtml(family.name)}`)}
    <form class="dialog-form" id="contribution-form">
      <input type="hidden" name="familyId" value="${escapeHtml(family.id)}">
      <div class="form-row"><label>Importe (€)<input name="amount" required inputmode="decimal" value="${formatMoney(activeQuotaPlan().monthlyAmountCents).replace(" €", "")}"></label><label>Fecha<input name="date" required type="date" value="${todayIso()}"></label></div>
      <label>Concepto<input name="concept" required maxlength="80" value="Aportación"></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">Guardar aportación</button></div>
    </form>`);
}

function openQuotaDialog() {
  const plan = activeQuotaPlan();
  openDialog(`${dialogHeader("Configuración anual", "Cuota de la comunidad")}
    <form class="dialog-form" id="quota-form">
      <div class="form-row"><label>Año<input name="year" required type="number" min="2020" max="2100" value="${plan.year}"></label><label>Cuota mensual (€)<input name="monthlyAmount" required inputmode="decimal" value="${formatMoney(plan.monthlyAmountCents).replace(" €", "")}"></label></div>
      <div class="quota-calculation"><span>Cuota anual</span><strong data-annual-quota>${formatMoney(plan.annualAmountCents)}</strong><small>12 mensualidades. Los ejercicios ya cerrados se conservan sin cambios.</small></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">Guardar demo</button></div>
    </form>`);
}

function openWaterTariffDialog() {
  const tariff = currentWaterTariff();
  const saveLabel = authService ? "Guardar tarifa" : "Guardar demo";
  openDialog(`${dialogHeader("Configuración de agua", "Tarifa por m³")}
    <form class="dialog-form" id="water-tariff-form">
      <p class="form-help">La nueva tarifa se aplica desde hoy. Las liquidaciones ya emitidas conservan siempre su precio original.</p>
      <div class="form-row"><label>Vigente desde<input name="validFrom" required type="date" value="${todayIso()}" readonly></label><label>Precio por m³ (€)<input name="price" required inputmode="decimal" value="${formatMoney(tariff.priceCentsPerM3).replace(" €", "")}"></label></div>
      <label>Nota del cambio <textarea name="notes" maxlength="300" rows="3" placeholder="Opcional, por ejemplo: nueva tarifa de suministro"></textarea></label>
      <div class="quota-calculation"><span>Tarifa anterior</span><strong>${formatMoney(tariff.priceCentsPerM3)} / m³</strong><small>Vigente desde ${formatDate(tariff.validFrom)}. El histórico queda conservado.</small></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${saveLabel}</button></div>
    </form>`);
}

function openWaterSettlementDialog() {
  const { preview, error } = waterSettlementState();
  if (!preview || error || preview.totalUsageM3 <= 0) {
    showToast(error || "No hay consumo nuevo pendiente de liquidar.");
    return;
  }
  openDialog(`${dialogHeader("Revisión antes de confirmar", "Liquidar el agua")}
    <div class="settlement-dialog">
      <p class="settlement-period">Del ${formatDate(data.lastWaterSettlement.date)} al ${formatDate(preview.periodEnd)}</p>
      <div class="settlement-list">${preview.items.map((item) => `<div class="settlement-row"><span><strong>${escapeHtml(item.familyName)}</strong><small>${formatDecimal(item.previousReadingM3)} → ${formatDecimal(item.currentReadingM3)} m³</small></span><span><small>${formatDecimal(item.usageM3)} m³</small><strong>${formatMoney(item.amountCents)}</strong></span></div>`).join("")}</div>
      <div class="settlement-total"><span>Total a liquidar</span><strong>${formatMoney(preview.totalAmountCents)}</strong><small>${formatDecimal(preview.totalUsageM3)} m³</small></div>
      <p class="demo-disclaimer">Al confirmar se creará un cargo en la cuenta de cada familia. Cualquier saldo a favor se compensará automáticamente. Es una simulación y se borrará al recargar.</p>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="button" data-confirm-water-settlement>Confirmar liquidación demo</button></div>
    </div>`);
}

function openFamilyCreateDialog() {
  const plan = activeQuotaPlan();
  const saveLabel = authService ? "Guardar familia" : "Guardar demo";
  openDialog(`${dialogHeader("Nueva ficha", "Añadir una familia")}
    <form class="dialog-form" id="family-form">
      <label>Nombre de la familia<input name="name" required maxlength="80" placeholder="Ej. Familia Naranjo"></label>
      <div class="form-row"><label>Nombre corto<input name="shortName" required maxlength="30" placeholder="Naranjo"></label><label>Número de miembros<input name="members" required type="number" inputmode="numeric" min="1" max="50" value="2"></label></div>
      <label>Fecha de alta<input name="joinedAt" required type="date" value="${todayIso()}"></label>
      <div class="quota-calculation"><span>Cuota aplicable en ${plan.year}</span><strong>${formatMoney(plan.monthlyAmountCents)} al mes</strong><small>${formatMoney(plan.annualAmountCents)} al año</small></div>
      <label>Observaciones<textarea name="notes" maxlength="500" rows="3" placeholder="Opcional"></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${saveLabel}</button></div>
    </form>`);
}

function openExpenseDialog(expenseId = null) {
  const categories = data.expenseCategories.map((category) => category.name);
  const families = data.families.filter((family) => family.active);
  const expense = expenseId ? data.expenses.find((item) => item.id === expenseId) : null;
  if (expenseId && !expense) return;
  if (!categories.length) {
    showToast("Antes de registrar un gasto, administración debe crear una categoría.");
    return;
  }
  const saveLabel = expense ? "Guardar corrección" : authService ? "Guardar gasto" : "Guardar demo";
  openDialog(`${dialogHeader(expense ? "Corrección" : "Datos de demostración", expense ? "Editar gasto" : "Añadir un gasto")}
    <form class="dialog-form" id="expense-form">${expense ? `<input type="hidden" name="id" value="${escapeHtml(expense.id)}">` : ""}
      <label>Concepto<input name="concept" required maxlength="80" placeholder="Ej. Reparación de la cancela" value="${escapeHtml(expense?.concept ?? "")}"></label>
      <div class="form-row"><label>Importe (€)<input name="amount" required inputmode="decimal" placeholder="0,00" value="${expense ? centsInputValue(expense.amountCents) : ""}"></label><label>Fecha<input name="date" required type="date" value="${escapeHtml(expense?.date ?? todayIso())}"></label></div>
      <label>Categoría<select name="category" required>${categories.map((category) => `<option${category === expense?.category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("")}</select></label>
      <label>Proveedor<input name="provider" maxlength="80" placeholder="Nombre ficticio" value="${escapeHtml(expense?.provider === "Sin proveedor" ? "" : expense?.provider ?? "")}"></label>
      <fieldset class="choice-fieldset"><legend>¿Quién ha pagado?</legend><div class="choice-options"><label><input type="radio" name="paymentSource" value="COMMUNITY"${expense?.paymentSource !== "FAMILIES" ? " checked" : ""}><span><strong>Cuenta de la comunidad</strong><small>El dinero sale del banco común.</small></span></label><label><input type="radio" name="paymentSource" value="FAMILIES"${expense?.paymentSource === "FAMILIES" ? " checked" : ""}><span><strong>Una o varias familias</strong><small>Se añade como saldo a su favor.</small></span></label></div></fieldset>
      <div class="allocation-editor" data-expense-payers${expense?.paymentSource === "FAMILIES" ? "" : " hidden"}><div class="allocation-editor__heading"><strong>Importe adelantado por cada familia</strong><small>La suma debe coincidir con el gasto.</small></div>${families.map((family) => { const payer = expense?.payers?.find((item) => item.familyId === family.id); return `<div class="payer-row"><label><input type="checkbox" name="payerFamilyId" value="${escapeHtml(family.id)}"${payer ? " checked" : ""}><span>${escapeHtml(family.name)}</span></label><label class="payer-amount"><span class="sr-only">Importe pagado por ${escapeHtml(family.name)}</span><input data-payer-amount data-family-id="${escapeHtml(family.id)}" inputmode="decimal" placeholder="0,00" value="${payer ? centsInputValue(payer.amountCents) : ""}"${payer ? "" : " disabled"}><small>€</small></label></div>`; }).join("")}<div class="allocation-check" data-payer-total>Selecciona quién pagó.</div></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${saveLabel}</button></div>
    </form>`);
}

function openAssessmentDialog(assessmentId = null) {
  const families = data.families.filter((family) => family.active);
  const assessment = assessmentId ? data.assessments.find((item) => item.id === assessmentId) : null;
  if (assessmentId && !assessment) return;
  const selectedIds = new Set(assessment?.allocations?.map((item) => item.familyId) ?? families.map((family) => family.id));
  openDialog(`${dialogHeader(assessment ? "Corrección" : "Cargo extraordinario", assessment ? "Editar derrama" : "Nueva derrama")}
    <form class="dialog-form" id="assessment-form">${assessment ? `<input type="hidden" name="id" value="${escapeHtml(assessment.id)}">` : ""}
      <label>Concepto<input name="concept" required maxlength="100" placeholder="Ej. Reparación de la zona norte" value="${escapeHtml(assessment?.concept ?? "")}"></label>
      <div class="form-row"><label>Importe total (€)<input name="amount" required inputmode="decimal" placeholder="0,00" value="${assessment ? centsInputValue(assessment.totalAmountCents) : ""}"></label><label>Fecha<input name="date" required type="date" value="${escapeHtml(assessment?.date ?? todayIso())}"></label></div>
      <fieldset class="allocation-editor"><legend>¿A qué familias se aplica?</legend><p>Se repartirá por igual solo entre las seleccionadas.</p>${families.map((family) => `<label class="assessment-family"><input type="checkbox" name="assessmentFamilyId" value="${escapeHtml(family.id)}"${selectedIds.has(family.id) ? " checked" : ""}><span><strong>${escapeHtml(family.name)}</strong><small data-assessment-share="${escapeHtml(family.id)}">Importe por calcular</small></span></label>`).join("")}</fieldset>
      <div class="quota-calculation"><span>Reparto previsto</span><strong data-assessment-preview>Indica el importe</strong><small data-assessment-families>${families.length} familias seleccionadas</small></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${assessment ? "Guardar corrección" : authService ? "Crear derrama" : "Crear derrama demo"}</button></div>
    </form>`);
}

function openWaterDialog(familyId = data.families.find((family) => family.active)?.id) {
  const activeFamilies = data.families.filter((family) => family.active && data.waterReadings.some((reading) => reading.familyId === family.id));
  const family = activeFamilies.find((item) => item.id === familyId) || activeFamilies[0];
  if (!family) {
    showToast("No hay una familia activa para registrar la lectura.");
    return;
  }
  const latest = data.waterReadings.filter((reading) => reading.familyId === family.id).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) {
    showToast("Esta familia todavía no tiene un contador preparado.");
    return;
  }
  const saveLabel = authService ? "Guardar lectura" : "Guardar demo";
  openDialog(`${dialogHeader("Lectura acumulada", "Nueva lectura de agua")}
    <form class="dialog-form" id="water-form">
      <label>Familia<select name="familyId" data-water-family-select>${activeFamilies.map((item) => `<option value="${escapeHtml(item.id)}"${item.id === family.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <div class="previous-reading"><span>Lectura anterior</span><strong data-previous-reading>${formatDecimal(latest.readingM3)} m³</strong></div>
      <label>Lectura actual (m³)<input name="reading" required inputmode="decimal" placeholder="${formatDecimal(latest.readingM3)}" aria-describedby="reading-help"></label>
      <small id="reading-help">Debe ser igual o superior a la lectura anterior.</small>
      <label>Fecha de lectura<input name="date" required type="date" value="${todayIso()}"></label>
      <p class="form-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">${saveLabel}</button></div>
    </form>`);
}

function openWaterCorrectionDialog(readingId) {
  const reading = data.waterReadings.find((item) => item.id === readingId);
  const family = data.families.find((item) => item.id === reading?.familyId);
  if (!reading || !family) return;
  openDialog(`${dialogHeader("Corrección", `Lectura de ${escapeHtml(family.name)}`)}<form class="dialog-form" id="water-correction-form"><input type="hidden" name="id" value="${escapeHtml(reading.id)}"><p class="form-help">No se puede modificar una lectura ya liquidada.</p><label>Lectura acumulada (m³)<input name="reading" required inputmode="decimal" value="${formatDecimal(reading.readingM3)}"></label><label>Fecha<input name="date" required type="date" value="${escapeHtml(reading.date)}"></label><p class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cancelar</button><button class="primary-button" type="submit">Guardar corrección</button></div></form>`);
}

function openWaterHistoryDialog(familyId) {
  const family = data.families.find((item) => item.id === familyId);
  if (!family) return;
  const readings = data.waterReadings.filter((item) => item.familyId === familyId).sort((a, b) => b.date.localeCompare(a.date));
  openDialog(`${dialogHeader("Contador individual", escapeHtml(family.name))}<div class="water-history"><p class="form-help">Pulsa una lectura pendiente para corregirla. Las liquidadas quedan protegidas.</p>${readings.map((reading) => { const settled = isWaterReadingSettled(reading); const content = `<span><strong>${formatDecimal(reading.readingM3)} m³</strong><small>${formatDate(reading.date)} · ${settled ? "Liquidada" : "Pendiente de liquidar"}</small></span>`; return settled ? `<article class="water-history__row is-settled">${content}<span class="reading-status">Liquidada</span></article>` : `<button class="water-history__row is-editable" type="button" data-edit-water-reading="${escapeHtml(reading.id)}">${content}<span class="reading-status">Corregir</span></button>`; }).join("")}<div class="dialog-actions"><button class="secondary-button" type="button" data-close-dialog>Cerrar</button><button class="primary-button" type="button" data-water-history-add="${escapeHtml(familyId)}">Nueva lectura</button></div></div>`);
}

function parseEuroInput(value) {
  const normalized = value.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

function centsInputValue(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function bindDialogInteractions() {
  const dialog = document.querySelector("#app-dialog");
  dialog.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-water-history-add]")?.addEventListener("click", (event) => { dialog.close(); openWaterDialog(event.currentTarget.dataset.waterHistoryAdd); });
  dialog.querySelectorAll("[data-edit-water-reading]").forEach((button) => button.addEventListener("click", () => openWaterCorrectionDialog(button.dataset.editWaterReading)));
  dialog.querySelector("[data-add-contribution]")?.addEventListener("click", (event) => {
    const familyId = event.currentTarget.dataset.addContribution;
    dialog.close();
    openContributionDialog(familyId);
  });
  const quotaAmountInput = dialog.querySelector("#quota-form input[name='monthlyAmount']");
  quotaAmountInput?.addEventListener("input", () => {
    const monthlyAmountCents = parseEuroInput(quotaAmountInput.value);
    dialog.querySelector("[data-annual-quota]").textContent = Number.isInteger(monthlyAmountCents) && monthlyAmountCents >= 0 ? formatMoney(calculateAnnualQuotaCents(monthlyAmountCents)) : "—";
  });
  const expenseForm = dialog.querySelector("#expense-form");
  const syncExpensePayers = (redistribute = true) => {
    if (!expenseForm) return;
    const familyPayment = expenseForm.elements.paymentSource.value === "FAMILIES";
    const panel = expenseForm.querySelector("[data-expense-payers]");
    panel.hidden = !familyPayment;
    const selected = [...expenseForm.querySelectorAll("input[name='payerFamilyId']:checked")];
    const totalCents = parseEuroInput(expenseForm.elements.amount.value);
    expenseForm.querySelectorAll("[data-payer-amount]").forEach((input) => { input.disabled = !familyPayment || !selected.some((checkbox) => checkbox.value === input.dataset.familyId); });
    if (redistribute && familyPayment && Number.isInteger(totalCents) && totalCents > 0 && selected.length) {
      const allocations = splitCentsEvenly(totalCents, selected.map((checkbox) => checkbox.value));
      allocations.forEach((allocation) => { expenseForm.querySelector(`[data-payer-amount][data-family-id='${allocation.familyId}']`).value = centsInputValue(allocation.amountCents); });
    }
    const allocatedCents = sumCents(selected, (checkbox) => {
      const value = parseEuroInput(expenseForm.querySelector(`[data-payer-amount][data-family-id='${checkbox.value}']`).value);
      return Number.isInteger(value) ? value : 0;
    });
    const summary = expenseForm.querySelector("[data-payer-total]");
    summary.textContent = !selected.length ? "Selecciona quién pagó." : `Repartido ${formatMoney(allocatedCents)} de ${Number.isInteger(totalCents) ? formatMoney(totalCents) : "—"}.`;
    summary.classList.toggle("is-valid", selected.length > 0 && allocatedCents === totalCents);
  };
  expenseForm?.querySelectorAll("input[name='paymentSource']").forEach((input) => input.addEventListener("change", () => syncExpensePayers(true)));
  expenseForm?.querySelector("input[name='amount']")?.addEventListener("input", () => syncExpensePayers(true));
  expenseForm?.querySelectorAll("input[name='payerFamilyId']").forEach((input) => input.addEventListener("change", () => syncExpensePayers(true)));
  expenseForm?.querySelectorAll("[data-payer-amount]").forEach((input) => input.addEventListener("input", () => syncExpensePayers(false)));

  const assessmentForm = dialog.querySelector("#assessment-form");
  const syncAssessmentPreview = () => {
    if (!assessmentForm) return;
    const selectedIds = [...assessmentForm.querySelectorAll("input[name='assessmentFamilyId']:checked")].map((input) => input.value);
    const totalCents = parseEuroInput(assessmentForm.elements.amount.value);
    let allocations = [];
    if (Number.isInteger(totalCents) && totalCents > 0 && selectedIds.length) allocations = splitCentsEvenly(totalCents, selectedIds);
    assessmentForm.querySelectorAll("[data-assessment-share]").forEach((label) => {
      const allocation = allocations.find((item) => item.familyId === label.dataset.assessmentShare);
      label.textContent = allocation ? formatMoney(allocation.amountCents) : selectedIds.includes(label.dataset.assessmentShare) ? "Importe por calcular" : "No participa";
    });
    assessmentForm.querySelector("[data-assessment-preview]").textContent = allocations.length ? formatMoney(totalCents) : "Revisa importe y familias";
    assessmentForm.querySelector("[data-assessment-families]").textContent = `${selectedIds.length} ${selectedIds.length === 1 ? "familia seleccionada" : "familias seleccionadas"}`;
  };
  assessmentForm?.querySelector("input[name='amount']")?.addEventListener("input", syncAssessmentPreview);
  assessmentForm?.querySelectorAll("input[name='assessmentFamilyId']").forEach((input) => input.addEventListener("change", syncAssessmentPreview));
  syncAssessmentPreview();
  dialog.querySelectorAll("[data-tab-demo]").forEach((button) => button.addEventListener("click", () => showToast("El histórico detallado llegará al conectar Supabase.")));
  dialog.querySelectorAll("input[name='theme']").forEach((input) => input.addEventListener("change", () => {
    const result = globalThis.HUERTA_THEME_MANAGER.applyTheme(input.value);
    if (!result.applied) return;
    dialog.querySelectorAll(".theme-option").forEach((option) => {
      const optionInput = option.querySelector("input");
      const selected = optionInput.value === result.theme.id;
      option.classList.toggle("is-selected", selected);
      option.querySelector(".theme-option__state").textContent = selected ? "Activo" : optionInput.disabled ? "Pendiente" : "Elegir";
    });
    showToast(`Diseño ${result.theme.name} aplicado en este dispositivo.`);
  }));
  dialog.querySelector("[data-sign-out]")?.addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Cerrando…";
    try {
      await authService.signOut();
    } catch (signOutError) {
      console.error(signOutError);
    } finally {
      dialog.close();
      data = undefined;
      renderLogin();
    }
  });

  dialog.querySelector("[data-edit-meeting]")?.addEventListener("click", (event) => {
    const meeting = (data.meetings ?? []).find((item) => item.id === event.currentTarget.dataset.editMeeting); if (meeting) openMeetingForm(meeting);
  });
  dialog.querySelector("[data-create-minutes]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget; button.disabled = true; button.textContent = "Creando…";
    try { await service.createMeetingMinutes(button.dataset.createMinutes); data = await service.getSnapshot(); openMeetingDetail(button.dataset.createMinutes); showToast("Borrador de acta creado."); }
    catch (error) { console.error(error); showToast("No hemos podido crear el acta."); button.disabled = false; }
  });
  dialog.querySelector("[data-edit-minutes]")?.addEventListener("click", (event) => openMinutesForm(event.currentTarget.dataset.meeting));
  dialog.querySelectorAll("[data-edit-minutes-item]").forEach((button) => button.addEventListener("click", () => openMinutesItemForm(button.dataset.meeting, button.dataset.editMinutesItem)));
  dialog.querySelector("[data-close-minutes]")?.addEventListener("click", async (event) => {
    if (!window.confirm("¿Cerrar el acta? Después quedará protegida y no se podrá modificar.")) return;
    const button = event.currentTarget; button.disabled = true; button.textContent = "Cerrando…";
    try { await service.closeMeetingMinutes(button.dataset.closeMinutes); data = await service.getSnapshot(); openMeetingDetail(button.dataset.meeting); showToast("Acta cerrada."); }
    catch (error) { console.error(error); showToast("No se puede cerrar todavía. Completa asistentes, resúmenes y decisiones."); button.disabled = false; button.textContent = "Cerrar acta"; }
  });
  dialog.querySelector("[data-add-agenda-item]")?.addEventListener("click", (event) => openAgendaItemForm(event.currentTarget.dataset.addAgendaItem));
  dialog.querySelector("[data-meeting-back]")?.addEventListener("click", (event) => openMeetingDetail(event.currentTarget.dataset.meetingBack));
  dialog.querySelector("[data-edit-agenda-item]")?.addEventListener("click", (event) => {
    const meeting = (data.meetings ?? []).find((value) => value.id === event.currentTarget.dataset.meeting); const item = meeting?.agenda?.find((value) => value.id === event.currentTarget.dataset.editAgendaItem); if (item) openAgendaItemForm(meeting.id, item);
  });
  dialog.querySelector("[data-delete-meeting]")?.addEventListener("click", async (event) => {
    if (!window.confirm("¿Eliminar esta reunión y todo su orden del día?")) return;
    try { await service.deleteMeeting(event.currentTarget.dataset.deleteMeeting); data = await service.getSnapshot(); dialog.close(); renderRoute(); showToast("Reunión eliminada."); }
    catch (error) { console.error(error); showToast("No hemos podido eliminar la reunión."); }
  });
  dialog.querySelectorAll("[data-delete-agenda-item]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("¿Eliminar este punto del orden del día?")) return;
    try { await service.deleteAgendaItem(button.dataset.deleteAgendaItem); data = await service.getSnapshot(); openMeetingDetail(button.dataset.meeting); showToast("Punto eliminado."); }
    catch (error) { console.error(error); showToast("No hemos podido eliminar el punto."); }
  }));
  dialog.querySelectorAll("[data-move-agenda]").forEach((button) => button.addEventListener("click", async () => {
    const meeting = (data.meetings ?? []).find((item) => item.id === button.dataset.meeting); const ids = meeting.agenda.map((item) => item.id); const index = ids.indexOf(button.dataset.item); const target = button.dataset.moveAgenda === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]]; button.disabled = true;
    try { await service.reorderAgendaItems(meeting.id, ids); data = await service.getSnapshot(); openMeetingDetail(meeting.id); }
    catch (error) { console.error(error); showToast("No hemos podido cambiar el orden."); button.disabled = false; }
  }));
  dialog.querySelector("#meeting-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const payload = { id: values.get("id") || undefined, date: values.get("date"), time: values.get("time"), place: String(values.get("place")).trim(), status: values.get("status") || "PLANIFICADA", notes: String(values.get("notes") ?? "").trim() }; const submit = formElement.querySelector("button[type='submit']"); const error = formElement.querySelector(".form-error"); submit.disabled = true; submit.textContent = "Guardando…";
    try { if (payload.id) await service.updateMeeting(payload); else await service.createMeeting(payload); data = await service.getSnapshot(); dialog.close(); renderRoute(); showToast(payload.id ? "Reunión actualizada." : "Reunión creada."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar la reunión."; error.hidden = false; submit.disabled = false; submit.textContent = payload.id ? "Guardar cambios" : "Crear reunión"; }
  });
  dialog.querySelector("#agenda-item-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const payload = { id: values.get("id") || undefined, meetingId: values.get("meetingId"), title: String(values.get("title")).trim(), description: String(values.get("description") ?? "").trim(), proposalId: values.get("proposalId") || null, notes: String(values.get("notes") ?? "").trim() }; const submit = formElement.querySelector("button[type='submit']"); const error = formElement.querySelector(".form-error"); submit.disabled = true; submit.textContent = "Guardando…";
    try { if (payload.id) await service.updateAgendaItem(payload); else await service.createAgendaItem(payload); data = await service.getSnapshot(); openMeetingDetail(payload.meetingId); showToast(payload.id ? "Punto actualizado." : "Punto añadido."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar el punto."; error.hidden = false; submit.disabled = false; submit.textContent = "Guardar punto"; }
  });
  dialog.querySelector("#minutes-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const meetingId = values.get("meetingId"); const submit = formElement.querySelector("button[type='submit']"); const error = formElement.querySelector(".form-error"); submit.disabled = true; submit.textContent = "Guardando…";
    try { await service.updateMeetingMinutes({ id: values.get("id"), attendeeFamilyIds: values.getAll("attendee"), content: String(values.get("content") ?? "").trim(), status: values.get("status") }); data = await service.getSnapshot(); openMeetingDetail(meetingId); showToast("Acta actualizada."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar el acta."; error.hidden = false; submit.disabled = false; submit.textContent = "Guardar acta"; }
  });
  dialog.querySelector("#minutes-item-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const meetingId = values.get("meetingId"); const submit = formElement.querySelector("button[type='submit']"); const error = formElement.querySelector(".form-error"); submit.disabled = true; submit.textContent = "Guardando…";
    try { await service.updateMinutesItem({ id: values.get("id"), summary: String(values.get("summary")).trim(), decision: String(values.get("decision")).trim(), observations: String(values.get("observations") ?? "").trim() }); data = await service.getSnapshot(); openMeetingDetail(meetingId); showToast("Punto del acta actualizado."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar el punto."; error.hidden = false; submit.disabled = false; submit.textContent = "Guardar punto"; }
  });

  dialog.querySelector("[data-edit-proposal]")?.addEventListener("click", (event) => {
    const proposal = (data.proposals ?? []).find((item) => item.id === event.currentTarget.dataset.editProposal);
    if (proposal) openProposalForm(proposal);
  });
  dialog.querySelector("[data-add-proposal-budget]")?.addEventListener("click", (event) => openProposalBudgetForm(event.currentTarget.dataset.addProposalBudget));
  dialog.querySelector("[data-proposal-back]")?.addEventListener("click", (event) => openProposalDetail(event.currentTarget.dataset.proposalBack));
  dialog.querySelector("[data-set-proposal-voting]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget; const status = button.dataset.setProposalVoting;
    if (status === "CERRADA" && !window.confirm("¿Cerrar la votación? Después no se podrán cambiar los votos.")) return;
    button.disabled = true; button.textContent = status === "ABIERTA" ? "Abriendo…" : "Cerrando…";
    try { await service.setProposalVotingStatus(button.dataset.proposal, status); data = await service.getSnapshot(); openProposalDetail(button.dataset.proposal); showToast(status === "ABIERTA" ? "Votación abierta." : "Votación cerrada."); }
    catch (error) { console.error(error); showToast("No hemos podido cambiar la votación."); button.disabled = false; }
  });
  dialog.querySelector("[data-delete-proposal]")?.addEventListener("click", async (event) => {
    if (!window.confirm("¿Eliminar esta propuesta y todos sus presupuestos?")) return;
    const button = event.currentTarget; button.disabled = true; button.textContent = "Eliminando…";
    try { await service.deleteProposal(button.dataset.deleteProposal); data = await service.getSnapshot(); dialog.close(); renderRoute(); showToast("Propuesta eliminada."); }
    catch (error) { console.error(error); button.disabled = false; button.textContent = "Eliminar"; showToast("No hemos podido eliminar la propuesta."); }
  });
  dialog.querySelectorAll("[data-delete-proposal-budget]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("¿Eliminar este presupuesto?")) return;
    try { await service.deleteProposalBudget(button.dataset.deleteProposalBudget); data = await service.getSnapshot(); openProposalDetail(button.dataset.proposal); showToast("Presupuesto eliminado."); }
    catch (error) { console.error(error); showToast("No hemos podido eliminar el presupuesto."); }
  }));
  dialog.querySelector("#proposal-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const error = formElement.querySelector(".form-error");
    const estimatedText = String(values.get("estimatedBudget") ?? "").trim(); const estimatedBudgetCents = estimatedText ? parseEuroInput(estimatedText) : null;
    if (estimatedBudgetCents !== null && (!Number.isInteger(estimatedBudgetCents) || estimatedBudgetCents < 0)) { error.textContent = "Revisa el presupuesto estimado."; error.hidden = false; return; }
    const payload = { id: values.get("id") || undefined, title: String(values.get("title")).trim(), description: String(values.get("description")).trim(), date: values.get("date"), estimatedBudgetCents, status: values.get("status") || "IDEA", notes: String(values.get("notes") ?? "").trim() };
    const submit = formElement.querySelector("button[type='submit']"); submit.disabled = true; submit.textContent = "Guardando…";
    try { if (payload.id) await service.updateProposal(payload); else await service.createProposal(payload); data = await service.getSnapshot(); dialog.close(); renderRoute(); showToast(payload.id ? "Propuesta actualizada." : "Propuesta creada."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar la propuesta. Revisa los datos."; error.hidden = false; submit.disabled = false; submit.textContent = payload.id ? "Guardar cambios" : "Crear propuesta"; }
  });
  dialog.querySelector("#proposal-budget-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const amountCents = parseEuroInput(values.get("amount")); const error = formElement.querySelector(".form-error");
    if (!Number.isInteger(amountCents) || amountCents <= 0) { error.textContent = "Escribe un importe válido mayor que cero."; error.hidden = false; return; }
    const submit = formElement.querySelector("button[type='submit']"); submit.disabled = true; submit.textContent = "Guardando…";
    try { const proposalId = values.get("proposalId"); await service.createProposalBudget({ proposalId, provider: String(values.get("provider")).trim(), amountCents, description: String(values.get("description") ?? "").trim(), date: values.get("date"), notes: String(values.get("notes") ?? "").trim() }); data = await service.getSnapshot(); openProposalDetail(proposalId); showToast("Presupuesto añadido."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar el presupuesto."; error.hidden = false; submit.disabled = false; submit.textContent = "Guardar presupuesto"; }
  });
  dialog.querySelector("#proposal-vote-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const formElement = event.currentTarget; const values = new FormData(formElement); const proposalId = values.get("proposalId"); const submit = formElement.querySelector("button[type='submit']"); const error = formElement.querySelector(".form-error");
    submit.disabled = true; submit.textContent = "Guardando…";
    try { await service.castProposalVote(proposalId, values.get("familyId"), values.get("vote")); data = await service.getSnapshot(); openProposalDetail(proposalId); showToast("Voto guardado. Puedes cambiarlo mientras siga abierta."); }
    catch (saveError) { console.error(saveError); error.textContent = "No hemos podido guardar el voto."; error.hidden = false; submit.disabled = false; submit.textContent = "Guardar voto"; }
  });

  dialog.querySelector("#bank-movement-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = new FormData(formElement);
    const assignment = String(values.get("assignment") ?? "");
    const submitButton = formElement.querySelector("button[type='submit']");
    const error = formElement.querySelector(".form-error");
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    try {
      await service.assignBankMovement({
        id: values.get("id"),
        familyId: assignment.startsWith("FAMILY:") ? assignment.slice(7) : null,
        expenseId: assignment.startsWith("EXPENSE:") ? assignment.slice(8) : null,
        categoryName: assignment.startsWith("CATEGORY:") ? assignment.slice(9) : null,
        notes: String(values.get("notes") ?? "").trim()
      });
      data = await service.getSnapshot();
      dialog.close();
      renderRoute();
      showToast(assignment ? "Asignación guardada." : "El movimiento vuelve a estar pendiente.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido guardar la asignación. Comprueba la conexión y vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = "Guardar asignación";
    }
  });

  dialog.querySelector("#family-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const members = Number(form.get("members"));
    const error = formElement.querySelector(".form-error");
    if (!Number.isInteger(members) || members < 1 || members > 50) {
      error.textContent = "Indica un número de miembros entre 1 y 50.";
      error.hidden = false;
      return;
    }
    const submitButton = formElement.querySelector("button[type='submit']");
    const defaultLabel = authService ? "Guardar familia" : "Guardar demo";
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    formElement.setAttribute("aria-busy", "true");
    try {
      const created = await service.createFamily({
        name: form.get("name").trim(),
        shortName: form.get("shortName").trim(),
        members,
        joinedAt: form.get("joinedAt"),
        quotaCents: activeQuotaPlan().annualAmountCents,
        notes: form.get("notes").trim()
      });
      data.families.push(created);
      data.community.activeFamilyCount += 1;
      dialog.close();
      renderRoute();
      showToast(authService ? "Familia añadida correctamente." : "Familia añadida a la demostración. Se borrará al recargar.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido guardar la familia. Revisa los datos y vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = defaultLabel;
      formElement.removeAttribute("aria-busy");
    }
  });

  dialog.querySelector("#contribution-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amountCents = parseEuroInput(form.get("amount"));
    const error = formElement.querySelector(".form-error");
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      error.textContent = "Escribe un importe válido mayor que cero.";
      error.hidden = false;
      return;
    }
    const submitButton = formElement.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    try {
      const created = await service.createContribution({ familyId: form.get("familyId"), date: form.get("date"), amountCents, concept: form.get("concept").trim() });
      data.contributions.push(created);
      const family = data.families.find((item) => item.id === created.familyId);
      family.contributedCents += created.amountCents;
      data.community.yearlyIncomeCents += created.amountCents;
      data.community.currentBalanceCents += created.amountCents;
      dialog.close();
      renderRoute();
      showToast("Aportación guardada correctamente.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido guardar la aportación. Vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = "Guardar aportación";
    }
  });

  dialog.querySelector("#quota-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const year = Number(form.get("year"));
    const monthlyAmountCents = parseEuroInput(form.get("monthlyAmount"));
    const error = formElement.querySelector(".form-error");
    if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(monthlyAmountCents) || monthlyAmountCents < 0) {
      error.textContent = "Revisa el año y el importe mensual.";
      error.hidden = false;
      return;
    }
    const submitButton = formElement.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    try {
      const plan = await service.setQuotaPlan({ year, monthlyAmountCents, annualAmountCents: calculateAnnualQuotaCents(monthlyAmountCents), dueThroughMonth: year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12 });
      data.quotaPlans.forEach((item) => { item.active = false; });
      const existingIndex = data.quotaPlans.findIndex((item) => item.year === plan.year);
      if (existingIndex >= 0) data.quotaPlans[existingIndex] = plan;
      else data.quotaPlans.push(plan);
      data.families.filter((family) => family.active).forEach((family) => { family.quotaCents = plan.annualAmountCents; });
      dialog.close();
      renderRoute();
      showToast(`Cuota ${year} actualizada en la demostración.`);
    } catch (saveError) {
      console.error(saveError);
      error.textContent = saveError.message === "No se puede modificar una cuota de un ejercicio ya cerrado." ? saveError.message : "No hemos podido actualizar la cuota. Vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = "Guardar demo";
    }
  });

  dialog.querySelector("#water-tariff-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const priceCentsPerM3 = parseEuroInput(form.get("price"));
    const error = formElement.querySelector(".form-error");
    if (!Number.isInteger(priceCentsPerM3) || priceCentsPerM3 < 0) {
      error.textContent = "Escribe un precio válido, en euros por m³.";
      error.hidden = false;
      return;
    }
    const submitButton = formElement.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    try {
      const tariff = await service.setWaterTariff({ validFrom: form.get("validFrom"), priceCentsPerM3, notes: form.get("notes").trim() });
      const existingIndex = data.waterTariffs.findIndex((item) => item.validFrom === tariff.validFrom);
      if (existingIndex >= 0) data.waterTariffs[existingIndex] = tariff;
      else data.waterTariffs.push(tariff);
      data.waterTariffs.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
      data.community.waterPriceCentsPerM3 = tariff.priceCentsPerM3;
      dialog.close();
      renderRoute();
      showToast(authService ? "Tarifa de agua actualizada. El histórico queda protegido." : "Tarifa de demostración actualizada.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido actualizar la tarifa. Comprueba los datos y vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = authService ? "Guardar tarifa" : "Guardar demo";
    }
  });

  dialog.querySelector("[data-confirm-water-settlement]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const error = dialog.querySelector(".form-error");
    const preview = waterSettlementState().preview;
    button.disabled = true;
    button.textContent = "Liquidando…";
    try {
      const created = await service.createWaterSettlement({ periodStart: data.lastWaterSettlement.date, periodEnd: preview.periodEnd, items: preview.items, totalUsageM3: preview.totalUsageM3, totalAmountCents: preview.totalAmountCents });
      data.waterSettlements.push(created);
      data.lastWaterSettlement = { id: created.id, date: created.periodEnd, settledReadings: created.items.map((item) => ({ familyId: item.familyId, meterId: item.meterId, readingM3: item.currentReadingM3 })) };
      dialog.close();
      renderRoute();
      showToast("Liquidación creada. Los cargos ya están incluidos en los saldos familiares.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido crear la liquidación. Comprueba las lecturas y vuelve a intentarlo.";
      error.hidden = false;
      button.disabled = false;
      button.textContent = "Confirmar liquidación demo";
    }
  });

  expenseForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amountCents = parseEuroInput(form.get("amount"));
    const error = event.currentTarget.querySelector(".form-error");
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      error.textContent = "Escribe un importe válido mayor que cero.";
      error.hidden = false;
      return;
    }
    const paymentSource = form.get("paymentSource");
    let payers = [];
    if (paymentSource === "FAMILIES") {
      payers = form.getAll("payerFamilyId").map((familyId) => ({ familyId, amountCents: parseEuroInput(event.currentTarget.querySelector(`[data-payer-amount][data-family-id='${familyId}']`).value) }));
      if (!payers.length || payers.some((payer) => !Number.isInteger(payer.amountCents) || payer.amountCents <= 0) || sumCents(payers, (payer) => payer.amountCents) !== amountCents) {
        error.textContent = "Selecciona quién pagó y comprueba que los importes sumen exactamente el total del gasto.";
        error.hidden = false;
        return;
      }
    }
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    event.currentTarget.setAttribute("aria-busy", "true");
    try {
      const payload = { id: form.get("id") || undefined, concept: form.get("concept").trim(), amountCents, date: form.get("date"), category: form.get("category"), provider: form.get("provider").trim() || "Sin proveedor", paymentSource, payers, notes: "" };
      const editing = Boolean(payload.id);
      const created = editing ? await service.updateExpense(payload) : await service.createExpense(payload);
      if (editing) data = await service.getSnapshot();
      else {
        data.expenses.unshift(created);
        data.community.yearlyExpensesCents += created.amountCents;
        if (created.paymentSource === "COMMUNITY") data.community.currentBalanceCents -= created.amountCents;
        const category = data.expenseCategories.find((item) => item.name === created.category);
        if (category) category.amountCents += created.amountCents;
      }
      dialog.close();
      expenseFilter = "Todas";
      renderRoute();
      showToast(editing ? "Gasto corregido correctamente." : authService ? "Gasto guardado correctamente." : "Gasto añadido a la demostración. Se borrará al recargar.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido guardar el gasto. Comprueba la conexión y vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = form.get("id") ? "Guardar corrección" : authService ? "Guardar gasto" : "Guardar demo";
      event.currentTarget.removeAttribute("aria-busy");
    }
  });

  assessmentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const totalAmountCents = parseEuroInput(form.get("amount"));
    const familyIds = form.getAll("assessmentFamilyId");
    const error = event.currentTarget.querySelector(".form-error");
    if (!Number.isInteger(totalAmountCents) || totalAmountCents <= 0 || !familyIds.length) {
      error.textContent = "Indica un importe válido y selecciona al menos una familia.";
      error.hidden = false;
      return;
    }
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Creando…";
    try {
      const payload = { id: form.get("id") || undefined, concept: form.get("concept").trim(), date: form.get("date"), totalAmountCents, allocations: splitCentsEvenly(totalAmountCents, familyIds), notes: "" };
      const editing = Boolean(payload.id);
      const created = editing ? await service.updateAssessment(payload) : await service.createAssessment(payload);
      if (editing) data = await service.getSnapshot();
      else data.assessments.unshift(created);
      dialog.close();
      renderRoute();
      showToast(editing ? "Derrama corregida correctamente." : "Derrama creada. Ya aparece en el saldo de las familias seleccionadas.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido crear la derrama. Revisa los datos y vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = form.get("id") ? "Guardar corrección" : authService ? "Crear derrama" : "Crear derrama demo";
    }
  });

  const familySelect = dialog.querySelector("[data-water-family-select]");
  familySelect?.addEventListener("change", () => {
    const latest = data.waterReadings.filter((reading) => reading.familyId === familySelect.value).sort((a, b) => b.date.localeCompare(a.date))[0];
    dialog.querySelector("[data-previous-reading]").textContent = `${formatDecimal(latest.readingM3)} m³`;
    dialog.querySelector("input[name='reading']").placeholder = formatDecimal(latest.readingM3);
  });
  dialog.querySelector("#water-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = Number(String(form.get("reading")).replace(",", "."));
    const familyId = form.get("familyId");
    const latest = data.waterReadings.filter((reading) => reading.familyId === familyId).sort((a, b) => b.date.localeCompare(a.date))[0];
    const error = event.currentTarget.querySelector(".form-error");
    try {
      if (current <= latest.readingM3) throw new RangeError("La lectura debe ser mayor que la anterior.");
      calculateWaterUsage(current, latest.readingM3);
    } catch (validationError) {
      error.textContent = validationError instanceof RangeError ? "La lectura debe ser mayor que la anterior. Revísala o pide a un administrador que registre el cambio de contador." : "Escribe una lectura válida.";
      error.hidden = false;
      return;
    }
    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";
    event.currentTarget.setAttribute("aria-busy", "true");
    try {
      const created = await service.createWaterReading({ familyId, meterId: latest.meterId, date: form.get("date"), readingM3: current, previousReadingM3: latest.readingM3, appliedPriceCents: data.community.waterPriceCentsPerM3, observations: "" });
      data.waterReadings.push(created);
      dialog.close();
      renderRoute();
      showToast(authService ? "Lectura guardada correctamente." : "Lectura añadida a la demostración. Se borrará al recargar.");
    } catch (saveError) {
      console.error(saveError);
      error.textContent = "No hemos podido guardar la lectura. Comprueba la conexión y vuelve a intentarlo.";
      error.hidden = false;
      submitButton.disabled = false;
      submitButton.textContent = authService ? "Guardar lectura" : "Guardar demo";
      event.currentTarget.removeAttribute("aria-busy");
    }
  });
  dialog.querySelector("#water-correction-form")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const readingM3 = Number(String(form.get("reading")).replace(",", ".")); const error = event.currentTarget.querySelector(".form-error");
    if (!Number.isFinite(readingM3) || readingM3 < 0) { error.textContent = "Escribe una lectura válida."; error.hidden = false; return; }
    try { const updated = await service.updateWaterReading({ id: form.get("id"), date: form.get("date"), readingM3, observations: "" }); const index = data.waterReadings.findIndex((item) => item.id === updated.id); data.waterReadings[index] = { ...data.waterReadings[index], ...updated }; dialog.close(); renderRoute(); showToast("Lectura corregida correctamente."); } catch (saveError) { error.textContent = "No hemos podido corregir esa lectura. Puede estar liquidada o no encajar con las demás lecturas."; error.hidden = false; }
  });
}

function openMoreDialog() {
  const pendingRoutes = visibleRoutes().filter((route) => !["inicio", "familias", "gastos", "agua"].includes(route.id));
  openDialog(`${dialogHeader("Navegación", "Más secciones")}<div class="more-menu">${pendingRoutes.map((route) => route.enabled ? `<a href="#${route.id}"><span>${icon(route.icon)}</span><strong>${route.label}</strong><small>Disponible</small></a>` : `<div><span>${icon(route.icon)}</span><strong>${route.label}</strong><small>Próxima fase</small></div>`).join("")}</div>`);
}

function openAppearanceDialog() {
  const manager = globalThis.HUERTA_THEME_MANAGER;
  const activeTheme = manager.getActiveTheme();
  openDialog(`${dialogHeader("Preferencias de este dispositivo", "Apariencia")}
    <div class="appearance-profile">
      <span aria-hidden="true">${escapeHtml(data.viewer.displayName.slice(0, 2).toUpperCase())}</span>
      <div><strong>${escapeHtml(data.viewer.displayName)}</strong><small>${isAdministrator() ? "Administrador" : "Perfil normal"}${authService ? "" : " · datos ficticios"}</small></div>
    </div>
    <fieldset class="theme-configurator">
      <legend>Elige el diseño</legend>
      <p>La apariencia se guarda solo en este navegador.</p>
      <div class="theme-options">
        ${manager.themes.map((theme) => `<label class="theme-option${theme.id === activeTheme.id ? " is-selected" : ""}${theme.available ? "" : " is-unavailable"}">
          <input type="radio" name="theme" value="${theme.id}"${theme.id === activeTheme.id ? " checked" : ""}${theme.available ? "" : " disabled"}>
          <span class="theme-option__preview theme-option__preview--${theme.id}" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
          <span class="theme-option__copy"><strong>${theme.name}</strong><small>${theme.description}</small></span>
          <span class="theme-option__state">${theme.id === activeTheme.id ? "Activo" : theme.available ? "Elegir" : "Pendiente"}</span>
        </label>`).join("")}
      </div>
      <div class="aero-note">${icon("palette")}<p><strong>Aero nocturno.</strong> Cristal oscuro, reflejos azulados y profundidad inspirados en Windows Vista, conservando la claridad de lectura.</p></div>
    </fieldset>
    ${authService ? `<div class="session-actions"><button class="secondary-button" type="button" data-sign-out>Cerrar sesión</button></div>` : ""}`);
}

function bindInteractions() {
  document.querySelectorAll("[data-action='demo']").forEach((button) => button.addEventListener("click", () => showToast("Acción de demostración. No se ha guardado ningún dato.")));
  document.querySelector("[data-more]")?.addEventListener("click", openMoreDialog);
  document.querySelectorAll(".nav-item.is-disabled").forEach((item) => item.addEventListener("click", (event) => { event.preventDefault(); showToast("Esta sección llegará en una próxima fase."); }));
  document.querySelectorAll("[data-family-id]").forEach((button) => button.addEventListener("click", () => openFamilyDialog(button.dataset.familyId)));
  document.querySelector("[data-demo-add='familia']")?.addEventListener("click", openFamilyCreateDialog);
  document.querySelector("[data-open-quota]")?.addEventListener("click", openQuotaDialog);
  document.querySelector("[data-open-water-tariff]")?.addEventListener("click", openWaterTariffDialog);
  document.querySelector("[data-open-bank-rules]")?.addEventListener("click", openBankRulesDialog);
  document.querySelector("[data-open-proposal]")?.addEventListener("click", () => openProposalForm());
  document.querySelectorAll("[data-proposal-id]").forEach((button) => button.addEventListener("click", () => openProposalDetail(button.dataset.proposalId)));
  document.querySelector("[data-open-meeting]")?.addEventListener("click", () => openMeetingForm());
  document.querySelectorAll("[data-meeting-id]").forEach((button) => button.addEventListener("click", () => openMeetingDetail(button.dataset.meetingId)));
  document.querySelector("[data-open-expense]")?.addEventListener("click", openExpenseDialog);
  document.querySelector("[data-open-assessment]")?.addEventListener("click", openAssessmentDialog);
  document.querySelectorAll("[data-edit-expense]").forEach((button) => button.addEventListener("click", () => openExpenseDialog(button.dataset.editExpense)));
  document.querySelectorAll("[data-edit-assessment]").forEach((button) => button.addEventListener("click", () => openAssessmentDialog(button.dataset.editAssessment)));
  document.querySelectorAll("[data-edit-bank-movement]").forEach((button) => button.addEventListener("click", () => openBankMovementDialog(button.dataset.editBankMovement)));
  document.querySelectorAll("[data-bank-filter]").forEach((button) => button.addEventListener("click", () => { bankMovementFilter = button.dataset.bankFilter; renderRoute(); }));
  document.querySelector("[data-cancel-bank-preview]")?.addEventListener("click", () => { bankPreview = null; renderRoute(); });
  document.querySelector("[data-apply-bank-rules]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Aplicando…";
    try {
      const result = await service.applyReconciliationRules();
      data = await service.getSnapshot();
      renderRoute();
      showToast(result.assigned ? `${result.assigned} movimientos asignados por las reglas.` : "No había coincidencias nuevas.");
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "Aplicar reglas";
      showToast("No hemos podido aplicar las reglas.");
    }
  });
  document.querySelectorAll("[data-revert-bank-import]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("¿Revertir esta importación? Se eliminarán sus movimientos y las aportaciones o gastos creados automáticamente.")) return;
    button.disabled = true;
    button.textContent = "Revirtiendo…";
    try {
      const result = await service.revertBankImport(button.dataset.revertBankImport);
      data = await service.getSnapshot();
      renderRoute();
      showToast(`Importación revertida: ${result.removed} movimientos eliminados.`);
    } catch (error) {
      console.error(error);
      button.disabled = false;
      button.textContent = "Revertir";
      showToast("No se puede revertir mientras tenga gastos manuales enlazados.");
    }
  }));
  document.querySelector("[data-open-water]")?.addEventListener("click", () => openWaterDialog());
  document.querySelector("[data-open-water-settlement]")?.addEventListener("click", openWaterSettlementDialog);
  document.querySelectorAll("[data-water-history]").forEach((button) => button.addEventListener("click", () => openWaterHistoryDialog(button.dataset.waterHistory)));
  document.querySelectorAll("[data-expense-filter]").forEach((button) => button.addEventListener("click", () => { expenseFilter = button.dataset.expenseFilter; renderRoute(); }));
  document.querySelector("[data-open-appearance]")?.addEventListener("click", openAppearanceDialog);
  document.querySelector("[data-bank-demo]")?.addEventListener("click", () => createBankPreview([{ Fecha: "01/09/2026", Concepto: "TRANSFERENCIA FICTICIA", Importe: "100,00", Saldo: "2.500,00", Referencia: "DEMO-001" }], "demo"));
  document.querySelector("[data-bank-file]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const control = event.currentTarget;
    const label = control.closest("label");
    control.disabled = true;
    label?.setAttribute("aria-busy", "true");
    showToast("Analizando el extracto…");
    try { await createBankPreview(await parseBankFile(file), file.name); }
    catch (error) { showToast(error.message || "No hemos podido leer ese extracto."); }
    finally { control.disabled = false; label?.removeAttribute("aria-busy"); }
  });
  document.querySelectorAll("[data-confirm-bank-import]").forEach((button) => button.addEventListener("click", async (event) => {
    if (!bankPreview) return;
    const button = event.currentTarget;
    button.disabled = true; button.textContent = "Importando…";
    try {
      const result = await service.importBankMovements({ source: bankPreview.records[0]?.source ?? "extracto", rows: bankPreview.records.filter((item) => !item.duplicate) });
      data = await service.getSnapshot();
      for (const record of bankPreview.records.filter((item) => !item.duplicate && item.assignment)) {
        const movement = data.bankMovements.find((item) => item.fingerprint === record.fingerprint);
        if (movement) await service.assignBankMovement({
          id: movement.id,
          familyId: record.assignment.startsWith("FAMILY:") ? record.assignment.slice(7) : null,
          categoryName: record.assignment.startsWith("CATEGORY:") ? record.assignment.slice(9) : null
        });
      }
      data = await service.getSnapshot(); bankPreview = null; renderRoute();
      showToast(`${result.imported} movimientos importados; ${result.duplicates} duplicados omitidos.`);
    } catch (error) { button.disabled = false; button.textContent = "Confirmar importación"; showToast("No hemos podido importar el extracto. Comprueba que eres administrador."); }
  }));
  document.querySelectorAll("[data-bank-assignment]").forEach((select) => select.addEventListener("change", () => {
    const record = bankPreview?.records[Number(select.dataset.bankAssignment)];
    if (record) record.assignment = select.value;
  }));
}

function registerWebMcpTools() {
  if (authService) return;
  const context = document.modelContext;
  if (!context?.registerTool) return;

  const lifecycle = new AbortController();
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  Promise.resolve(context.registerTool({
    name: "add_demo_water_reading",
    title: "Añadir lectura demo",
    description: "Añade una lectura acumulada de agua a los datos temporales de demostración y abre la pantalla Agua.",
    inputSchema: {
      type: "object",
      properties: {
        familyId: { type: "string", description: "ID ficticio de la familia, por ejemplo fam_roble." },
        readingM3: { type: "number", description: "Nueva lectura acumulada en metros cúbicos." },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Fecha ISO YYYY-MM-DD." }
      },
      required: ["familyId", "readingM3", "date"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false },
    async execute({ familyId, readingM3, date }) {
      const family = data.families.find((item) => item.active && item.id === familyId);
      if (!family) throw new Error("La familia de demostración no existe o está inactiva.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("La fecha debe usar el formato YYYY-MM-DD.");
      const latest = data.waterReadings.filter((reading) => reading.familyId === familyId).sort((a, b) => b.date.localeCompare(a.date))[0];
      const usageM3 = calculateWaterUsage(readingM3, latest.readingM3);
      const created = await service.createWaterReading({ familyId, meterId: latest.meterId, date, readingM3, previousReadingM3: latest.readingM3, appliedPriceCents: data.community.waterPriceCentsPerM3, observations: "" });
      data.waterReadings.push(created);
      location.hash = "agua";
      renderRoute();
      showToast("Lectura añadida a la demostración. Se borrará al recargar.");
      return { ok: true, familyId, usageM3, persisted: false };
    }
  }, { signal: lifecycle.signal })).catch((error) => console.error("No se pudo registrar la herramienta de demostración.", error));
}

async function loadPanel() {
  document.body.classList.remove("is-auth-view");
  loadingState.hidden = false;
  pageContent.hidden = true;
  data = await service.getSnapshot();
  const viewerName = data.viewer?.displayName ?? "Mi cuenta";
  const profileButton = document.querySelector(".profile-button");
  profileButton.querySelector("[data-profile-initials]").textContent = viewerName.slice(0, 2).toUpperCase();
  profileButton.querySelector("strong").textContent = viewerName;
  profileButton.querySelector("small").textContent = isAdministrator() ? "Administrador" : "Perfil normal";
  loadingState.hidden = true;
  pageContent.hidden = false;
  renderRoute();
  registerWebMcpTools();
}

async function initialize() {
  try {
    if (authService && !(await authService.restoreSession())) {
      renderLogin();
      return;
    }
    await loadPanel();
  } catch (error) {
    console.error(error);
    if (authService && [401, 403].includes(error.status)) {
      await authService.signOut();
      renderLogin({ message: "La sesión ha caducado o ha sido revocada. Vuelve a entrar." });
      return;
    }
    loadingState.innerHTML = `<div class="error-state"><strong>No hemos podido cargar el panel.</strong><span>Comprueba la conexión y vuelve a intentarlo.</span><button class="secondary-button" type="button" onclick="location.reload()">Reintentar</button></div>`;
  }
}

window.addEventListener("hashchange", renderRoute);
document.querySelector("#app-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
initialize();
