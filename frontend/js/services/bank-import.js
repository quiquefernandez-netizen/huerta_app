const FIELD_ALIASES = {
  date: ["fecha", "date", "fecha movimiento", "fecha_operacion", "fecha operación", "fecha de operación"],
  valueDate: ["fecha valor", "fecha_valor", "value date"],
  concept: ["concepto", "concept", "descripción", "descripcion", "description", "detalle"],
  amount: ["importe", "amount", "movimiento", "cantidad"],
  balance: ["saldo", "balance", "saldo disponible"],
  reference: ["referencia", "reference", "ref", "nº referencia", "numero referencia", "nº mov", "nº movimiento", "numero mov", "número mov"]
};

function key(value) {
  return String(value ?? "").trim().toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function valueFor(row, field) {
  const entries = Object.entries(row ?? {});
  const aliases = FIELD_ALIASES[field].map(key);
  const match = entries.find(([name]) => aliases.includes(key(name)));
  return match?.[1];
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalText(value) {
  return cleanText(value).toLocaleLowerCase("es-ES").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseDate(value) {
  const text = cleanText(value);
  if (!text) throw new Error("Falta la fecha del movimiento.");
  let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const iso = `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    if (!validDate(iso)) throw new Error(`Fecha no válida: ${text}.`);
    return iso;
  }
  match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (match) {
    const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (!validDate(iso)) throw new Error(`Fecha no válida: ${text}.`);
    return iso;
  }
  throw new Error(`Fecha no reconocida: ${text}.`);
}

function validDate(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso;
}

function parseCents(value, { required = false } = {}) {
  const text = cleanText(value).replace(/[€$\s]/g, "");
  if (!text) {
    if (required) throw new Error("Falta el importe del movimiento.");
    return null;
  }
  let normalized = text;
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? normalized.replace(/\./g, "").replace(",", ".") : normalized.replace(/,/g, "");
  } else if (comma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`Importe no válido: ${text}.`);
  const cents = Math.round(number * 100);
  if (!Number.isSafeInteger(cents)) throw new Error(`Importe fuera de rango: ${text}.`);
  return cents;
}

function fnv1a(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function fingerprintBankMovement(movement) {
  const canonical = [
    movement.date,
    movement.valueDate ?? "",
    movement.amountCents,
    movement.balanceCents ?? "",
    canonicalText(movement.reference),
    canonicalText(movement.concept)
  ].join("|");
  return `mov_${fnv1a(canonical)}_${fnv1a(canonical.split("").reverse().join(""))}`;
}

export function normalizeBankRow(row, { source = "generic", rowNumber = null } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError("La fila bancaria no es válida.");
  const date = parseDate(valueFor(row, "date"));
  const concept = cleanText(valueFor(row, "concept"));
  if (!concept) throw new Error("Falta el concepto del movimiento.");
  const amountCents = parseCents(valueFor(row, "amount"), { required: true });
  const valueDateValue = valueFor(row, "valueDate");
  const movement = {
    date,
    valueDate: valueDateValue ? parseDate(valueDateValue) : null,
    concept,
    amountCents,
    balanceCents: parseCents(valueFor(row, "balance")),
    reference: cleanText(valueFor(row, "reference")) || null,
    source: cleanText(source) || "generic"
  };
  return { ...movement, fingerprint: fingerprintBankMovement(movement), rowNumber };
}

export function normalizeBankRows(rows, options = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Las filas bancarias deben ser una lista.");
  const records = [];
  const errors = [];
  rows.forEach((row, index) => {
    if (!row || Object.values(row).every((value) => !cleanText(value))) return;
    try { records.push(normalizeBankRow(row, { ...options, rowNumber: index + 1 })); }
    catch (error) { errors.push({ rowNumber: index + 1, message: error.message }); }
  });
  return { records, errors };
}

export function detectBankDuplicates(records, existingMovements = []) {
  const existing = new Set(existingMovements.map((movement) => movement.fingerprint).filter(Boolean));
  const identity = (movement) => [movement.date, movement.valueDate ?? "", movement.amountCents, movement.balanceCents ?? "", canonicalText(movement.reference), canonicalText(movement.concept)].join("|");
  const existingIdentities = new Set(existingMovements.map(identity));
  const seen = new Set();
  return records.map((record) => {
    const recordIdentity = identity(record);
    const exists = existing.has(record.fingerprint) || existingIdentities.has(recordIdentity);
    const duplicate = exists || seen.has(recordIdentity);
    seen.add(recordIdentity);
    return { ...record, duplicate, duplicateReason: duplicate ? (exists ? "existing" : "repeated") : null };
  });
}
