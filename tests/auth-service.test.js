import test from "node:test";
import assert from "node:assert/strict";
import { SupabaseAuthService, createAuthService } from "../frontend/js/services/auth-service.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const authSession = { access_token: "anonymous-jwt", refresh_token: "refresh-token", expires_in: 3600 };
const appAccess = { ok: true, role: "NORMAL", display_name: "Acceso normal", expires_at: "2030-01-01T00:00:00Z" };

test("el modo demo no activa autenticación ni realiza peticiones", () => {
  assert.equal(createAuthService({ dataSource: "demo" }), null);
});

test("el acceso crea una sesión anónima y valida la contraseña en la Edge Function", async () => {
  const calls = [];
  const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
    localStorage: memoryStorage(), sessionStorage: memoryStorage(), now: () => 1_000_000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/auth/v1/signup")) return response(authSession);
      return response(appAccess);
    }
  });
  const session = await service.unlock("contraseña de prueba", false);
  assert.equal(session.app_access.role, "NORMAL");
  assert.equal(calls[0].url, "https://demo.supabase.co/auth/v1/signup");
  assert.deepEqual(JSON.parse(calls[0].options.body), {});
  assert.equal(calls[1].url, "https://demo.supabase.co/functions/v1/unlock-access");
  assert.equal(calls[1].options.headers.Authorization, "Bearer anonymous-jwt");
  assert.deepEqual(JSON.parse(calls[1].options.body), { password: "contraseña de prueba", remember: false });
});

test("recordar acceso persiste la sesión, pero nunca la contraseña", async () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
    localStorage, sessionStorage, now: () => 1_000_000,
    fetchImpl: async (url) => url.endsWith("/signup") ? response(authSession) : response(appAccess)
  });
  await service.unlock("secreto solo para el test", true);
  const saved = localStorage.getItem("la-huerta.access-session");
  assert.ok(saved);
  assert.equal(sessionStorage.getItem("la-huerta.tab-access-session"), null);
  assert.doesNotMatch(saved, /secreto solo para el test/);
  assert.doesNotMatch(saved, /password/i);
});

test("sin recordar, la sesión vive únicamente en la pestaña", async () => {
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
    localStorage, sessionStorage, now: () => 1_000_000,
    fetchImpl: async (url) => url.endsWith("/signup") ? response(authSession) : response(appAccess)
  });
  await service.unlock("secreto solo para el test", false);
  assert.equal(localStorage.getItem("la-huerta.access-session"), null);
  assert.ok(sessionStorage.getItem("la-huerta.tab-access-session"));
});

test("una sesión recordada renueva el JWT sin ampliar el acceso de aplicación", async () => {
  const localStorage = memoryStorage();
  localStorage.setItem("la-huerta.access-session", JSON.stringify({
    access_token: "caducado", refresh_token: "refresh-token", expires_at: 1,
    app_access: appAccess
  }));
  const calls = [];
  const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
    localStorage, sessionStorage: memoryStorage(), now: () => 2_000_000,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ ...authSession, access_token: "renovado" }); }
  });
  assert.equal(await service.getAccessToken(), "renovado");
  assert.match(calls[0].url, /token\?grant_type=refresh_token$/);
  assert.equal(JSON.parse(localStorage.getItem("la-huerta.access-session")).app_access.expires_at, appAccess.expires_at);
});

test("la contraseña vacía se rechaza antes de conectar", async () => {
  const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
    localStorage: memoryStorage(), sessionStorage: memoryStorage(), fetchImpl: async () => { throw new Error("No debería llamarse"); }
  });
  await assert.rejects(service.unlock("   "), /Escribe la contraseña/);
});

test("el servidor distingue contraseña incorrecta y límite de intentos", async () => {
  for (const [code, expected] of [["INVALID_CREDENTIALS", /no es correcta/], ["TOO_MANY_ATTEMPTS", /Demasiados intentos/]]) {
    const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
      localStorage: memoryStorage(), sessionStorage: memoryStorage(), now: () => 1_000_000,
      fetchImpl: async (url) => url.endsWith("/signup") ? response(authSession) : response({ code }, code === "TOO_MANY_ATTEMPTS" ? 429 : 401)
    });
    await assert.rejects(service.unlock("contraseña incorrecta"), expected);
  }
});

test("varios intentos de contraseña reutilizan el mismo usuario anónimo", async () => {
  let signups = 0;
  const service = new SupabaseAuthService("https://demo.supabase.co", "sb_publishable_demo", {
    localStorage: memoryStorage(), sessionStorage: memoryStorage(), now: () => 1_000_000,
    fetchImpl: async (url) => {
      if (url.endsWith("/signup")) { signups += 1; return response(authSession); }
      return response({ code: "INVALID_CREDENTIALS" }, 401);
    }
  });
  await assert.rejects(service.unlock("primer intento incorrecto"));
  await assert.rejects(service.unlock("segundo intento incorrecto"));
  assert.equal(signups, 1);
});
