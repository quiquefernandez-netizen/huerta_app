import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("el frontend contiene las regiones principales y configuración PWA", async () => {
  const html = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");
  for (const marker of ["main-content", "data-navigation", "data-mobile-navigation", "data-open-appearance", "app-dialog", "manifest.webmanifest", "theme-manager.js", "themes.css", "iconography.css", "data-icon-style=\"holo\"", "logo-dani-concept.png", "topbar-actions"]) {
    assert.ok(html.includes(marker), `Falta ${marker} en index.html`);
  }
});

test("el logo vuelve siempre a Inicio en escritorio y móvil", async () => {
  const html = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");
  assert.match(html, /class="brand" href="#inicio"/);
  assert.match(html, /class="topbar__home" href="#inicio" aria-label="Ir a Inicio"/);
});

test("la revisión visual ofrece marcos móviles de 390 y 360 píxeles", async () => {
  const html = await readFile(new URL("../frontend/mobile-preview.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/mobile-preview.css", import.meta.url), "utf8");
  assert.match(html, /data-width="390" data-height="844"/);
  assert.match(html, /data-width="360" data-height="800"/);
  assert.match(html, /iframe[^>]+src="\.\/index\.html#inicio"/);
  assert.match(styles, /--device-width:\s*390px/);
  assert.match(styles, /overflow:\s*hidden/);
});

test("el registro de temas ofrece Plano y Aero como diseños seleccionables", async () => {
  const manager = await readFile(new URL("../frontend/js/theme-manager.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/themes.css", import.meta.url), "utf8");
  assert.match(manager, /id: "plano"[\s\S]*?available: true/);
  assert.match(manager, /id: "aero"[\s\S]*?available: true/);
  assert.match(styles, /:root\[data-theme="plano"\]/);
  assert.match(styles, /:root\[data-theme="aero"\]\s*\{/);
});

test("los datos demo no incluyen los nombres reales indicados en requisitos", async () => {
  const source = await readFile(new URL("../frontend/js/data/demo-data.js", import.meta.url), "utf8");
  assert.equal(/Quique|Fernandez|Fernández|Enrique/i.test(source), false);
});

test("las páginas de Fase 1 están registradas como disponibles", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  for (const route of ["inicio", "familias", "gastos", "agua"]) {
    assert.match(source, new RegExp(`id: "${route}"[^\\n]+enabled: true`));
  }
});

test("Propuestas está disponible con varios presupuestos y formularios responsive", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  assert.match(source, /id: "propuestas"[^\n]+enabled: true/);
  assert.match(source, /function renderProposals/);
  assert.match(source, /id="proposal-form"/);
  assert.match(source, /id="proposal-budget-form"/);
  assert.match(source, /proposal\.budgets/);
  assert.match(styles, /\.proposal-grid/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.proposal-grid \{ grid-template-columns: 1fr/);
  assert.match(source, /id="proposal-vote-form"/);
  assert.match(source, /Elige tu familia/);
  assert.match(source, /data-set-proposal-voting="CERRADA"/);
  assert.match(styles, /\.vote-summary/);
});

test("Reuniones está disponible con orden del día editable y responsive", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  assert.match(source, /id: "reuniones"[^\n]+enabled: true/);
  assert.match(source, /function renderMeetings/);
  assert.match(source, /id="meeting-form"/);
  assert.match(source, /id="agenda-item-form"/);
  assert.match(source, /data-move-agenda="up"/);
  assert.match(styles, /\.meeting-card/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.agenda-list > li/);
  assert.match(source, /function meetingMinutesMarkup/);
  assert.match(source, /id="minutes-form"/);
  assert.match(source, /id="minutes-item-form"/);
  assert.match(source, /data-close-minutes/);
  assert.match(styles, /\.minutes-items/);
});

test("la interfaz deja al perfil normal registrar y reserva la administración", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(source, /route\.id !== "administracion" \|\| isAdministrator\(\)/);
  assert.match(source, /if \(route\.id === "gastos"\)[\s\S]*?data-open-expense/);
  assert.match(source, /readings\.length \? `<button class="secondary-button" type="button" data-open-water/);
  assert.match(source, /data-add-contribution="\$\{escapeHtml\(family\.id\)\}"/);
  assert.match(source, /isAdministrator\(\) \? `<button class="primary-button" type="button" data-open-water-settlement/);
  assert.match(source, /profileButton\.querySelector\("small"\)\.textContent = isAdministrator\(\) \? "Administrador" : "Perfil normal"/);
});

test("la cuota se configura únicamente desde Administración", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const topbarBlock = source.match(/function renderTopbar[\s\S]*?function renderRoute/)?.[0] ?? "";
  const adminBlock = source.match(/function renderAdministration[\s\S]*?function renderTopbar/)?.[0] ?? "";
  assert.doesNotMatch(topbarBlock, /data-open-quota/);
  assert.match(adminBlock, /data-open-quota/);
});

test("los movimientos bancarios guardados se pueden revisar y volver a editar", async () => {
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/022_bank_category_assignments.sql", import.meta.url), "utf8");
  assert.match(app, /data-edit-bank-movement/);
  assert.match(app, /id="bank-movement-form"/);
  assert.match(app, /categoryName: assignment\.startsWith\("CATEGORY:"\)/);
  assert.match(migration, /add column if not exists category_id/);
  assert.match(migration, /create function public\.assign_bank_movement/);
});

test("Banco ofrece un único flujo de preview, filtros, reglas e histórico reversible", async () => {
  const app = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const reconciliation = await readFile(new URL("../supabase/migrations/023_complete_bank_reconciliation.sql", import.meta.url), "utf8");
  const history = await readFile(new URL("../supabase/migrations/024_bank_import_history.sql", import.meta.url), "utf8");
  const integrity = await readFile(new URL("../supabase/migrations/025_bank_integrity.sql", import.meta.url), "utf8");
  assert.match(app, /Previsualización y conciliación/);
  assert.match(app, /Confirmar conciliación e importar/);
  assert.match(app, /data-bank-filter="pending"/);
  assert.match(app, /data-revert-bank-import/);
  assert.match(app, /data-rule-edit/);
  assert.match(reconciliation, /insert into public\.aportaciones/);
  assert.match(reconciliation, /insert into public\.gastos/);
  assert.match(history, /'bankImportBatches'/);
  assert.match(integrity, /create or replace function public\.import_bank_movements/);
  assert.match(integrity, /movement\.operation_date = v_operation_date/);
});

test("los importes de resumen se adaptan a cifras grandes sin salir de la tarjeta", async () => {
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  const themes = await readFile(new URL("../frontend/css/themes.css", import.meta.url), "utf8");
  assert.match(styles, /\.summary-card > div\s*\{[^}]*min-width:\s*0[^}]*flex:\s*1/);
  assert.match(styles, /\.summary-card strong\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.summary-card strong\s*\{[^}]*word-break:\s*break-all/);
  assert.match(themes, /\.summary-card:nth-child\(-n \+ 2\) strong\s*\{[^}]*white-space:\s*normal/);
});

test("las acciones de cabecera conservan superficie táctil y ocultan solo la etiqueta en móvil", async () => {
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(styles, /\n\s*\.primary-button\s*\{[^}]*font-size:\s*0/);
  assert.match(styles, /\.topbar-actions \.action-label\s*\{[^}]*display:\s*none/);
  assert.match(styles, /\.topbar-actions \.primary-button[^\{]+\{[^}]*width:\s*40px[^}]*min-height:\s*40px/);
});

test("la interfaz usa una cabecera compacta sin repetir el saludo ni grandes cabeceras de sección", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Buenos d[ií]as/i);
  assert.doesNotMatch(source, /class="(?:welcome-row|page-heading)"/);
  assert.match(styles, /\.topbar\s*\{[^}]*min-height:\s*72px/);
});

test("La Huerta se usa solo como nombre de instalación PWA", async () => {
  const files = await Promise.all([
    "../frontend/index.html",
    "../frontend/iconos.html",
    "../frontend/js/app.js",
    "../frontend/js/data/demo-data.js",
    "../frontend/js/icon-lab.js"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.equal(files.some((source) => /La Huerta/i.test(source)), false);
  const manifest = await readFile(new URL("../frontend/manifest.webmanifest", import.meta.url), "utf8");
  assert.match(manifest, /"name": "La Huerta"/);
  assert.match(manifest, /"short_name": "La Huerta"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-maskable-512\.png/);
});

test("la instalación PWA registra un service worker e iconos de Android", async () => {
  const html = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");
  const worker = await readFile(new URL("../frontend/service-worker.js", import.meta.url), "utf8");
  assert.match(html, /serviceWorker\.register\("\.\/service-worker\.js"/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /id="install-app-button"/);
  assert.match(html, /beforeinstallprompt/);
  assert.match(worker, /self\.addEventListener\("install"/);
  assert.match(worker, /self\.addEventListener\("fetch"/);
});

test("el reparto de gastos usa segmentos reales y porcentajes legibles", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  assert.match(source, /const expenseSegments/);
  assert.match(source, /del gasto/);
  assert.match(styles, /conic-gradient\(from -90deg, var\(--segments\)\)/);
  assert.match(styles, /\.donut > div/);
  assert.match(styles, /\.legend-copy small/);
});

test("la categoría Impuestos está disponible en la demo y en el seed de Supabase", async () => {
  const demo = await readFile(new URL("../frontend/js/data/demo-data.js", import.meta.url), "utf8");
  const seed = await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/008_add_tax_expense_category.sql", import.meta.url), "utf8");
  assert.match(demo, /Impuestos \/ tasas/);
  assert.match(seed, /Impuestos \/ tasas/);
  assert.match(migration, /Impuestos \/ tasas/);
  assert.match(migration, /on conflict \(name\) do update/);
});

test("agua y gastos explican los estados sin configuración inicial", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(source, /Aún no hay lecturas de agua/);
  assert.match(source, /Esta familia todavía no tiene un contador preparado/);
  assert.match(source, /Antes de registrar un gasto, administración debe crear una categoría/);
});

test("la aplicación muestra aportaciones, cuota administrativa y liquidación de agua", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(source, /Cuota anual/);
  assert.match(source, /Registrar aportación/);
  assert.match(source, /Liquidar agua/);
  assert.match(source, /saldo de cada familia/i);
  assert.match(source, /Nueva derrama/);
  assert.match(source, /¿Quién ha pagado?/);
  assert.match(source, /Una o varias familias/);
});

test("el laboratorio conserva cuatro propuestas y señala la aplicada", async () => {
  const html = await readFile(new URL("../frontend/iconos.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../frontend/js/icon-lab.js", import.meta.url), "utf8");
  for (const proposal of ["gingerbread", "honeycomb", "holo", "huerta"]) {
    assert.ok(html.includes(`data-variant="${proposal}"`), `Falta la propuesta ${proposal}`);
    assert.ok(script.includes(`${proposal}:`), `Falta el comportamiento de ${proposal}`);
  }
  assert.match(html, /opci[oó]n C est[aá] aplicada actualmente/i);
});

test("la propuesta C Holo se limita a Aero y Plano conserva sus iconos originales", async () => {
  const styles = await readFile(new URL("../frontend/css/iconography.css", import.meta.url), "utf8");
  assert.match(styles, /data-theme="aero"\]\[data-icon-style="holo"\]/);
  assert.doesNotMatch(styles, /data-theme="plano"\]\[data-icon-style="holo"\]/);
  assert.match(styles, /--holo-icon:/);
  assert.match(styles, /stroke-linecap:\s*square/);
});

test("el perfil usa icono de usuario solo en Aero y conserva iniciales en Plano", async () => {
  const html = await readFile(new URL("../frontend/index.html", import.meta.url), "utf8");
  const styles = await readFile(new URL("../frontend/css/styles.css", import.meta.url), "utf8");
  const themes = await readFile(new URL("../frontend/css/themes.css", import.meta.url), "utf8");
  assert.match(html, /symbol id="icon-user"/);
  assert.match(html, /class="profile-user-icon"/);
  assert.match(styles, /\.profile-user-icon\s*\{[^}]*display:\s*none/);
  assert.match(themes, /data-theme="aero"\][\s\S]*?\.profile-user-icon\s*\{[^}]*display:\s*block/);
});

test("Aero mantiene visible lo escrito en la contraseña", async () => {
  const themes = await readFile(new URL("../frontend/css/themes.css", import.meta.url), "utf8");
  assert.match(themes, /\[data-theme="aero"\] \.auth-form input\s*\{[^}]*color:\s*#f3f9ff/);
  assert.match(themes, /\[data-theme="aero"\] \.auth-form input\s*\{[^}]*caret-color:/);
});

test("la arquitectura está preparada para GitHub Pages y Supabase sin claves secretas", async () => {
  const config = await readFile(new URL("../frontend/config.js", import.meta.url), "utf8");
  const service = await readFile(new URL("../frontend/js/services/data-service.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/001_phase1_schema.sql", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");

  assert.match(config, /dataSource:\s*"supabase"/);
  assert.match(service, /dataSource === "supabase"/);
  assert.match(service, /rest\/v1\/rpc\/\$\{name\}/);
  for (const rpc of ["get_community_snapshot", "create_family", "create_expense", "create_water_reading"]) {
    assert.ok(service.includes(`this.rpc("${rpc}"`), `Falta el contrato RPC ${rpc}`);
  }
  assert.equal(/sb_secret_|service_role|postgres(?:ql)?:\/\//i.test(config), false);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all[\s\S]+from anon, authenticated/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*frontend/);
});
