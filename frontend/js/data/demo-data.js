const monthlyContribution = (familyId, months) => months.map((month, index) => ({
  id: `apo_${familyId}_${String(month).padStart(2, "0")}_${index}`,
  familyId,
  date: `2026-${String(month).padStart(2, "0")}-05`,
  amountCents: 2000,
  concept: "Aportación mensual"
}));

export const demoData = Object.freeze({
  viewer: { displayName: "Demo Roble", role: "ADMINISTRADOR", familyId: "fam_roble" },
  community: {
    name: "Comunidad Demo",
    currentBalanceCents: 284760,
    yearlyIncomeCents: 90000,
    yearlyExpensesCents: 312240,
    waterPriceCentsPerM3: 185,
    activeFamilyCount: 5,
    upToDateFamilyCount: 4,
    latestWaterUsageM3: 22.8,
    nextMeeting: { day: 18, month: "octubre", time: "18:30", place: "Zona común" }
  },
  quotaPlans: [
    { id: "plan_2026", year: 2026, monthlyAmountCents: 2000, annualAmountCents: 24000, dueThroughMonth: 9, active: true }
  ],
  waterTariffs: [
    { id: "tariff_2026", validFrom: "2026-01-01", validUntil: null, priceCentsPerM3: 185, active: true, notes: "Tarifa ficticia de demostración." }
  ],
  families: [
    { id: "fam_roble", name: "Familia Roble", shortName: "Roble", members: 3, active: true, joinedAt: "2024-01-01", quotaCents: 24000, contributedCents: 18000, notes: "" },
    { id: "fam_olivo", name: "Familia Olivo", shortName: "Olivo", members: 2, active: true, joinedAt: "2024-01-01", quotaCents: 24000, contributedCents: 18000, notes: "" },
    { id: "fam_pino", name: "Familia Pino", shortName: "Pino", members: 4, active: true, joinedAt: "2024-01-01", quotaCents: 24000, contributedCents: 16000, notes: "Falta la aportación ficticia de septiembre." },
    { id: "fam_encina", name: "Familia Encina", shortName: "Encina", members: 2, active: true, joinedAt: "2024-01-01", quotaCents: 24000, contributedCents: 18000, notes: "" },
    { id: "fam_almendro", name: "Familia Almendro", shortName: "Almendro", members: 3, active: true, joinedAt: "2024-01-01", quotaCents: 24000, contributedCents: 20000, notes: "Una aportación ficticia adelantada." }
  ],
  contributions: [
    ...monthlyContribution("fam_roble", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ...monthlyContribution("fam_olivo", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ...monthlyContribution("fam_pino", [1, 2, 3, 4, 5, 6, 7, 8]),
    ...monthlyContribution("fam_encina", [1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ...monthlyContribution("fam_almendro", [1, 2, 3, 4, 5, 6, 7, 8, 9, 9])
  ],
  expenses: [
    { id: "gas_001", date: "2026-08-28", concept: "Revisión instalación eléctrica", amountCents: 18327, category: "Electricidad", provider: "Servicios Luz Demo", paymentSource: "COMMUNITY", payers: [], notes: "" },
    { id: "gas_002", date: "2026-08-12", concept: "Reparación de bomba de agua", amountCents: 24650, category: "Reparaciones", provider: "Técnico Hidráulico Demo", paymentSource: "FAMILIES", payers: [{ familyId: "fam_roble", amountCents: 15000 }, { familyId: "fam_olivo", amountCents: 9650 }], notes: "Pagado en efectivo fuera de la cuenta de la comunidad." },
    { id: "gas_003", date: "2026-07-30", concept: "Factura de agua general", amountCents: 11980, category: "Agua general", provider: "Aguas Demo", paymentSource: "COMMUNITY", payers: [], notes: "" },
    { id: "gas_004", date: "2026-07-11", concept: "Material de jardinería", amountCents: 8940, category: "Material", provider: "Vivero de Muestra", paymentSource: "COMMUNITY", payers: [], notes: "" },
    { id: "gas_005", date: "2026-06-22", concept: "Seguro anual zonas comunes", amountCents: 52800, category: "Seguros", provider: "Seguros Ejemplo", paymentSource: "COMMUNITY", payers: [], notes: "" }
  ],
  assessments: [
    { id: "der_001", date: "2026-07-15", concept: "Mejora del cierre exterior", totalAmountCents: 30000, status: "ACTIVA", allocations: [{ familyId: "fam_roble", amountCents: 10000 }, { familyId: "fam_pino", amountCents: 10000 }, { familyId: "fam_almendro", amountCents: 10000 }], notes: "Derrama ficticia acordada solo por tres familias." }
  ],
  proposals: [
    { id: "prop_demo_1", title: "Mejorar la iluminación de la entrada", description: "Valorar una iluminación más eficiente y agradable para el acceso común.", date: "2026-08-20", estimatedBudgetCents: 85000, status: "EN_ESTUDIO", notes: "", voting: null, budgets: [
      { id: "pre_demo_1", provider: "Electricidad Ejemplo", amountCents: 79500, description: "Luminarias LED e instalación", date: "2026-08-28", notes: "Presupuesto ficticio." },
      { id: "pre_demo_2", provider: "Servicios Luz Demo", amountCents: 91000, description: "Instalación completa", date: "2026-08-30", notes: "Presupuesto ficticio." }
    ] },
    { id: "prop_demo_2", title: "Zona común con más sombra", description: "Estudiar una solución sencilla de sombra para los meses de verano.", date: "2026-09-01", estimatedBudgetCents: null, status: "IDEA", notes: "", voting: null, budgets: [] }
  ],
  meetings: [
    { id: "reu_demo_1", date: "2026-10-18", time: "18:30", place: "Zona común", status: "PLANIFICADA", notes: "", minutes: null, agenda: [
      { id: "ord_demo_1", position: 1, title: "Estado de las cuentas", description: "Resumen de aportaciones, gastos y banco.", proposalId: null, proposalTitle: null, notes: "" },
      { id: "ord_demo_2", position: 2, title: "Iluminación de la entrada", description: "Revisar los presupuestos recibidos.", proposalId: "prop_demo_1", proposalTitle: "Mejorar la iluminación de la entrada", notes: "" }
    ] },
    { id: "reu_demo_2", date: "2026-07-12", time: "19:00", place: "Zona común", status: "CELEBRADA", notes: "Reunión ficticia de muestra.", agenda: [
      { id: "ord_demo_3", position: 1, title: "Consumo de agua", description: "Revisión del consumo del semestre.", proposalId: null, proposalTitle: null, notes: "" }
    ], minutes: { id: "act_demo_1", meetingId: "reu_demo_2", date: "2026-07-12", content: "Resumen general ficticio de la reunión.", status: "REVISADA", closedAt: null, attendees: [{ familyId: "fam_roble", familyName: "Familia Roble" }, { familyId: "fam_olivo", familyName: "Familia Olivo" }], items: [{ id: "acp_demo_1", agendaItemId: "ord_demo_3", position: 1, subject: "Consumo de agua", summary: "Se revisó el consumo del semestre.", decision: "Continuar con las lecturas periódicas.", votingResult: null, observations: "" }] } }
  ],
  expenseCategories: [
    { name: "Agua general", amountCents: 46000, color: "#3f7f8b" },
    { name: "Electricidad", amountCents: 78000, color: "#d69c45" },
    { name: "Mantenimiento", amountCents: 64000, color: "#648a72" },
    { name: "Reparaciones", amountCents: 75240, color: "#bd654d" },
    { name: "Impuestos / tasas", amountCents: 0, color: "#7b6f94" },
    { name: "Otros", amountCents: 49000, color: "#8c7f72" }
  ],
  monthlyExpensesCents: [18400, 23600, 19800, 31200, 28600, 44700, 35900, 51200, 27200],
  waterReadings: [
    { id: "lec_001", familyId: "fam_roble", meterId: "con_roble", date: "2026-08-31", readingM3: 35.2, previousReadingM3: 31.5, appliedPriceCents: 185 },
    { id: "lec_002", familyId: "fam_olivo", meterId: "con_olivo", date: "2026-08-31", readingM3: 48.8, previousReadingM3: 44.1, appliedPriceCents: 185 },
    { id: "lec_003", familyId: "fam_pino", meterId: "con_pino", date: "2026-08-31", readingM3: 63.4, previousReadingM3: 56.6, appliedPriceCents: 185 },
    { id: "lec_004", familyId: "fam_encina", meterId: "con_encina", date: "2026-08-31", readingM3: 29.9, previousReadingM3: 26.4, appliedPriceCents: 185 },
    { id: "lec_005", familyId: "fam_almendro", meterId: "con_almendro", date: "2026-08-31", readingM3: 41.7, previousReadingM3: 37.6, appliedPriceCents: 185 }
  ],
  lastWaterSettlement: {
    id: "liq_demo_2025",
    date: "2025-12-31",
    settledReadings: [
      { familyId: "fam_roble", meterId: "con_roble", readingM3: 31.5 },
      { familyId: "fam_olivo", meterId: "con_olivo", readingM3: 44.1 },
      { familyId: "fam_pino", meterId: "con_pino", readingM3: 56.6 },
      { familyId: "fam_encina", meterId: "con_encina", readingM3: 26.4 },
      { familyId: "fam_almendro", meterId: "con_almendro", readingM3: 37.6 }
    ]
  },
  waterSettlements: []
});
