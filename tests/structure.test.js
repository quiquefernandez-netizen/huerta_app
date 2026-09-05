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

test("la interfaz oculta administración y altas de gasto al perfil normal", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(source, /route\.id !== "administracion" \|\| isAdministrator\(\)/);
  assert.match(source, /isAdministrator\(\) && route\.id === "gastos"[\s\S]*?data-open-expense/);
  assert.match(source, /profileButton\.querySelector\("small"\)\.textContent = isAdministrator\(\) \? "Administrador" : "Perfil normal"/);
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
  assert.match(styles, /conic-gradient\(var\(--segments\)\)/);
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

test("la demo muestra cuota configurable, aportaciones y liquidación de agua", async () => {
  const source = await readFile(new URL("../frontend/js/app.js", import.meta.url), "utf8");
  assert.match(source, /Configurar cuota/);
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

test("la arquitectura está preparada para GitHub Pages y Supabase sin claves secretas", async () => {
  const config = await readFile(new URL("../frontend/config.js", import.meta.url), "utf8");
  const service = await readFile(new URL("../frontend/js/services/data-service.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/001_phase1_schema.sql", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");

  assert.match(config, /dataSource:\s*"demo"/);
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
