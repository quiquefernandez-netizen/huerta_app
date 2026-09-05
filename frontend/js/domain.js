export function formatMoney(cents) {
  if (!Number.isInteger(cents)) throw new TypeError("El dinero debe expresarse en céntimos enteros.");
  const sign = cents < 0 ? "−" : "";
  const absoluteCents = Math.abs(cents);
  const euros = Math.floor(absoluteCents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimals = String(absoluteCents % 100).padStart(2, "0");
  return `${sign}${euros},${decimals} €`;
}

export function formatDate(isoDate) {
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${isoDate}T12:00:00`));
}

export function getContributionStatus(quotaCents, contributedCents) {
  const differenceCents = quotaCents - contributedCents;
  if (differenceCents === 0) return { key: "paid", label: "Al corriente", pendingCents: 0 };
  if (differenceCents < 0) return { key: "exceeded", label: "Aportación extra", pendingCents: 0 };
  if (contributedCents > 0) return { key: "partial", label: "Pago parcial", pendingCents: differenceCents };
  return { key: "pending", label: "Pendiente", pendingCents: differenceCents };
}

export function calculateAnnualQuotaCents(monthlyQuotaCents) {
  if (!Number.isInteger(monthlyQuotaCents) || monthlyQuotaCents < 0) {
    throw new TypeError("La cuota mensual debe expresarse en céntimos enteros.");
  }
  return monthlyQuotaCents * 12;
}

export function calculateExpectedQuotaCents(monthlyQuotaCents, dueThroughMonth) {
  if (!Number.isInteger(dueThroughMonth) || dueThroughMonth < 1 || dueThroughMonth > 12) {
    throw new RangeError("El mes de cuota debe estar entre 1 y 12.");
  }
  calculateAnnualQuotaCents(monthlyQuotaCents);
  return monthlyQuotaCents * dueThroughMonth;
}

export function calculateWaterUsage(currentReadingM3, previousReadingM3) {
  if (!Number.isFinite(currentReadingM3) || !Number.isFinite(previousReadingM3)) {
    throw new TypeError("Las lecturas deben ser números válidos.");
  }
  if (currentReadingM3 < previousReadingM3) {
    throw new RangeError("La lectura actual no puede ser menor que la anterior.");
  }
  return Math.round((currentReadingM3 - previousReadingM3) * 1000) / 1000;
}

export function calculateWaterCostCents(usageM3, priceCentsPerM3) {
  if (!Number.isInteger(priceCentsPerM3) || priceCentsPerM3 < 0) {
    throw new TypeError("La tarifa debe expresarse en céntimos enteros.");
  }
  return Math.round(usageM3 * priceCentsPerM3);
}

export function createWaterSettlementPreview({ families, readings, settledReadings, priceCentsPerM3 }) {
  const items = families.filter((family) => family.active).map((family) => {
    const latest = readings
      .filter((reading) => reading.familyId === family.id)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) throw new Error(`Falta una lectura para ${family.name}.`);

    const settled = settledReadings.find((reading) => reading.familyId === family.id && reading.meterId === latest.meterId);
    if (!settled) throw new Error(`Falta la lectura de la última liquidación para ${family.name}.`);

    const usageM3 = calculateWaterUsage(latest.readingM3, settled.readingM3);
    return {
      familyId: family.id,
      familyName: family.name,
      meterId: latest.meterId,
      readingId: latest.id,
      previousReadingM3: settled.readingM3,
      currentReadingM3: latest.readingM3,
      readingDate: latest.date,
      usageM3,
      priceCentsPerM3,
      amountCents: calculateWaterCostCents(usageM3, priceCentsPerM3)
    };
  });

  return {
    items,
    periodEnd: items.map((item) => item.readingDate).sort().at(-1) ?? null,
    totalUsageM3: Math.round(items.reduce((total, item) => total + item.usageM3, 0) * 1000) / 1000,
    totalAmountCents: sumCents(items, (item) => item.amountCents)
  };
}

export function splitCentsEvenly(totalCents, familyIds) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new TypeError("El importe debe expresarse en céntimos enteros y ser mayor que cero.");
  }
  const uniqueFamilyIds = [...new Set(familyIds)];
  if (!uniqueFamilyIds.length || uniqueFamilyIds.length !== familyIds.length) {
    throw new Error("Selecciona al menos una familia, sin duplicados.");
  }
  const baseAmountCents = Math.floor(totalCents / uniqueFamilyIds.length);
  const remainderCents = totalCents % uniqueFamilyIds.length;
  return uniqueFamilyIds.map((familyId, index) => ({
    familyId,
    amountCents: baseAmountCents + (index < remainderCents ? 1 : 0)
  }));
}

export function calculateFamilyAccount({ familyId, expectedQuotaCents, contributions = [], waterSettlements = [], assessments = [], expenses = [] }) {
  if (!Number.isInteger(expectedQuotaCents) || expectedQuotaCents < 0) {
    throw new TypeError("La cuota prevista debe expresarse en céntimos enteros.");
  }
  const contributionsCents = sumCents(contributions.filter((item) => item.familyId === familyId), (item) => item.amountCents);
  const advanceCreditsCents = sumCents(expenses.flatMap((expense) => expense.payers ?? []).filter((item) => item.familyId === familyId), (item) => item.amountCents);
  const waterChargesCents = sumCents(waterSettlements.flatMap((settlement) => settlement.items ?? []).filter((item) => item.familyId === familyId), (item) => item.amountCents);
  const assessmentChargesCents = sumCents(assessments.flatMap((assessment) => assessment.allocations ?? []).filter((item) => item.familyId === familyId), (item) => item.amountCents);
  const creditsCents = contributionsCents + advanceCreditsCents;
  const chargesCents = expectedQuotaCents + waterChargesCents + assessmentChargesCents;
  return {
    contributionsCents,
    advanceCreditsCents,
    creditsCents,
    quotaChargesCents: expectedQuotaCents,
    waterChargesCents,
    assessmentChargesCents,
    chargesCents,
    balanceCents: creditsCents - chargesCents
  };
}

export function sumCents(items, selector = (value) => value) {
  return items.reduce((total, item) => total + selector(item), 0);
}
