import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authMigrationUrl = new URL("../supabase/migrations/002_auth_and_rls.sql", import.meta.url);
const rpcMigrationUrl = new URL("../supabase/migrations/007_supabase_access_contracts.sql", import.meta.url);
const auditMigrationUrl = new URL("../supabase/migrations/004_phase1_audit.sql", import.meta.url);
const quotaMigrationUrl = new URL("../supabase/migrations/005_quota_and_water_settlement_batches.sql", import.meta.url);
const accountsMigrationUrl = new URL("../supabase/migrations/006_family_accounts_expenses_and_assessments.sql", import.meta.url);
const edgeFunctionUrl = new URL("../supabase/functions/unlock-access/index.ts", import.meta.url);

test("la API anónima permanece cerrada", async () => {
  const sql = await readFile(authMigrationUrl, "utf8");
  assert.match(sql, /revoke all on table[\s\S]+from anon;/i);
  assert.doesNotMatch(sql, /create policy[\s\S]+\bto anon\b/i);
});

test("las contraseñas viven como hashes en un esquema privado", async () => {
  const sql = await readFile(authMigrationUrl, "utf8");
  assert.match(sql, /create schema if not exists private/);
  assert.match(sql, /password_hash text not null/);
  assert.match(sql, /public\.crypt\(p_password, public\.gen_salt\('bf', 12\)\)/i);
  assert.doesNotMatch(sql, /password\s+text\s+not null/i);
  assert.match(sql, /revoke all on table private\.access_credentials[\s\S]*?from public, anon, authenticated/i);
});

test("solo el servidor puede comprobar, crear o revocar credenciales", async () => {
  const sql = await readFile(authMigrationUrl, "utf8");
  for (const signature of ["unlock_access\\(uuid, text, text, boolean\\)", "create_access_credential\\(text, text, text\\)", "revoke_access_credential\\(uuid\\)"]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated;`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role;`, "i"));
  }
});

test("las sesiones caducan y revocar una credencial invalida todas las suyas", async () => {
  const sql = await readFile(authMigrationUrl, "utf8");
  assert.match(sql, /session\.expires_at > pg_catalog\.now\(\)/);
  assert.match(sql, /when p_remember then interval '30 days' else interval '12 hours'/i);
  assert.match(sql, /update private\.app_sessions[\s\S]*?where credential_id = p_credential_id/i);
  assert.match(sql, /count\(\*\) >= 5[\s\S]*?interval '15 minutes'/i);
});

test("Normal y Administrador leen todos los datos comunitarios", async () => {
  const sql = `${await readFile(authMigrationUrl, "utf8")}\n${await readFile(rpcMigrationUrl, "utf8")}`;
  for (const policy of ["familias_active_select", "cuotas_active_select", "aportaciones_active_select", "gastos_active_select", "contadores_active_select", "lecturas_active_select", "liquidaciones_active_select", "derramas_active_select"]) {
    assert.ok(sql.includes(policy), `Falta la política compartida ${policy}`);
  }
  assert.doesNotMatch(sql, /familias_select_own_or_admin|lecturas_select_own_or_admin/);
});

test("las escrituras comprueban administración tanto en RLS como en RPC", async () => {
  const authSql = await readFile(authMigrationUrl, "utf8");
  const rpcSql = await readFile(rpcMigrationUrl, "utf8");
  for (const policy of ["familias_admin_write", "gastos_admin_write", "cuotas_admin_write", "lecturas_admin_write", "liquidaciones_admin_write"]) {
    const block = authSql.match(new RegExp(`create policy ${policy}[\\s\\S]*?with check \\([\\s\\S]*?\\);`, "i"))?.[0] ?? "";
    assert.match(block, /current_user_is_admin/);
  }
  for (const rpc of ["create_family", "create_expense", "create_assessment", "create_contribution", "set_quota_plan", "create_water_reading", "create_water_settlement"]) {
    const block = rpcSql.match(new RegExp(`create or replace function public\\.${rpc}[\\s\\S]*?\\n\\$\\$;`, "i"))?.[0] ?? "";
    assert.match(block, /current_user_is_admin/);
  }
});

test("la Edge Function verifica el JWT y usa la clave de servidor solo en backend", async () => {
  const source = await readFile(edgeFunctionUrl, "utf8");
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /user\?\.is_anonymous !== true/);
  assert.match(source, /RATE_LIMIT_PEPPER/);
  assert.match(source, /\/rest\/v1\/rpc\/unlock_access/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer \$\{serviceRoleKey\}`/);
  assert.doesNotMatch(source, /console\.(log|error).*password/i);
});

test("el snapshot devuelve todos los conjuntos usados por la Fase 1", async () => {
  const sql = await readFile(rpcMigrationUrl, "utf8");
  const block = sql.match(/create or replace function public\.get_community_snapshot[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.match(block, /security definer/i);
  assert.match(block, /current_user_is_active/);
  for (const key of ["'families'", "'contributions'", "'expenses'", "'assessments'", "'quotaPlans'", "'waterReadings'", "'waterSettlements'", "'lastWaterSettlement'"]) {
    assert.ok(block.includes(key), `Falta ${key} en el snapshot`);
  }
  assert.doesNotMatch(block, /v_is_admin or .*family_id/i);
});

test("gastos familiares y derramas exigen que el reparto cuadre en céntimos", async () => {
  const sql = await readFile(rpcMigrationUrl, "utf8");
  assert.match(sql, /v_allocated <> p_amount_cents/);
  assert.match(sql, /v_allocated <> p_total_amount_cents/);
  assert.match(sql, /payment_source.*'COMMUNITY'.*'FAMILIES'/is);
});

test("las escrituras relevantes generan auditoría sin exponer la función al cliente", async () => {
  const sql = await readFile(auditMigrationUrl, "utf8");
  assert.match(sql, /function public\.audit_phase1_change\(\)[\s\S]*?security definer/i);
  assert.match(sql, /revoke all on function public\.audit_phase1_change\(\) from public, anon, authenticated;/i);
  for (const table of ["familias", "cuotas", "aportaciones", "gastos", "lecturas_agua", "liquidaciones_agua"]) {
    assert.match(sql, new RegExp(`after insert or update or delete on public\\.${table}`, "i"));
  }
});

test("el modelo incluye cuotas configurables, lotes de agua, pagadores y derramas", async () => {
  const quotaSql = await readFile(quotaMigrationUrl, "utf8");
  const accountsSql = await readFile(accountsMigrationUrl, "utf8");
  assert.match(quotaSql, /annual_amount_cents\s*=\s*monthly_amount_cents \* 12/i);
  assert.match(quotaSql, /settlement_batch_id[\s\S]*references public\.lotes_liquidacion_agua/i);
  assert.match(accountsSql, /create table if not exists public\.gasto_pagadores/i);
  assert.match(accountsSql, /create table if not exists public\.derramas/i);
  assert.match(accountsSql, /create or replace view public\.movimientos_cuenta_familia/i);
});
