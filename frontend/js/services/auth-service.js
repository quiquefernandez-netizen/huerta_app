const PERSISTENT_SESSION_KEY = "la-huerta.access-session";
const TAB_SESSION_KEY = "la-huerta.tab-access-session";

function parseStoredSession(storage, key) {
  try {
    return JSON.parse(storage?.getItem(key) ?? "null");
  } catch {
    storage?.removeItem(key);
    return null;
  }
}

export class SupabaseAuthService {
  constructor(baseUrl, publishableKey, options = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:") throw new Error("La URL de Supabase debe utilizar HTTPS.");
    this.baseUrl = url.href.replace(/\/$/, "");
    this.authUrl = `${this.baseUrl}/auth/v1`;
    this.functionsUrl = `${this.baseUrl}/functions/v1`;
    this.publishableKey = publishableKey;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.localStorage = options.localStorage ?? globalThis.localStorage;
    this.sessionStorage = options.sessionStorage ?? globalThis.sessionStorage;
    this.now = options.now ?? (() => Date.now());
    this.session = null;
    this.pendingAuthSession = null;
    this.remember = false;
  }

  validatePassword(password) {
    const value = String(password ?? "");
    if (!value.trim()) throw new TypeError("Escribe la contraseña de acceso.");
    return value;
  }

  saveSession(session, remember = this.remember) {
    if (!session?.access_token || !session?.refresh_token || !session?.app_access?.expires_at) {
      throw new Error("Supabase no ha devuelto una sesión válida.");
    }
    const expiresAt = Number(session.expires_at) || Math.floor(this.now() / 1000) + Number(session.expires_in ?? 3600);
    this.session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: expiresAt,
      app_access: session.app_access
    };
    this.remember = Boolean(remember);
    this.localStorage?.removeItem(PERSISTENT_SESSION_KEY);
    this.sessionStorage?.removeItem(TAB_SESSION_KEY);
    const storage = this.remember ? this.localStorage : this.sessionStorage;
    const key = this.remember ? PERSISTENT_SESSION_KEY : TAB_SESSION_KEY;
    storage?.setItem(key, JSON.stringify(this.session));
    return this.session;
  }

  clearSession() {
    this.session = null;
    this.pendingAuthSession = null;
    this.remember = false;
    this.localStorage?.removeItem(PERSISTENT_SESSION_KEY);
    this.sessionStorage?.removeItem(TAB_SESSION_KEY);
  }

  loadStoredSession() {
    const tabSession = parseStoredSession(this.sessionStorage, TAB_SESSION_KEY);
    const persistentSession = parseStoredSession(this.localStorage, PERSISTENT_SESSION_KEY);
    this.session = tabSession ?? persistentSession;
    this.remember = !tabSession && Boolean(persistentSession);
    return this.session;
  }

  accessIsValid(session = this.session) {
    const expiresAt = Date.parse(session?.app_access?.expires_at ?? "");
    return Number.isFinite(expiresAt) && expiresAt > this.now();
  }

  async restoreSession() {
    if (!this.session) this.loadStoredSession();
    if (!this.session?.access_token || !this.session?.refresh_token || !this.accessIsValid()) {
      this.clearSession();
      return null;
    }
    if (this.session.expires_at * 1000 <= this.now() + 60_000) await this.refreshSession();
    return this.session;
  }

  async createAnonymousSession() {
    return this.requestAuth("/signup", { method: "POST", body: {} });
  }

  async unlock(password, remember = false) {
    const normalizedPassword = this.validatePassword(password);
    let authSession = this.pendingAuthSession ?? await this.restoreSession();
    if (!authSession) {
      authSession = await this.createAnonymousSession();
      this.pendingAuthSession = authSession;
    }
    const response = await this.fetchImpl(`${this.functionsUrl}/unlock-access`, {
      method: "POST",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${authSession.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password: normalizedPassword, remember: Boolean(remember) })
    });
    if (!response.ok) {
      let code = "";
      try { code = (await response.json())?.code ?? ""; } catch { code = ""; }
      if (code === "TOO_MANY_ATTEMPTS") throw new Error("Demasiados intentos. Espera unos minutos antes de volver a probar.");
      if (code === "INVALID_CREDENTIALS") throw new Error("La contraseña no es correcta.");
      throw new Error("No hemos podido completar el acceso. Comprueba la conexión y vuelve a intentarlo.");
    }
    const access = await response.json();
    this.pendingAuthSession = null;
    return this.saveSession({ ...authSession, app_access: access }, remember);
  }

  async refreshSession() {
    if (!this.session?.refresh_token || !this.accessIsValid()) {
      this.clearSession();
      return null;
    }
    try {
      const refreshed = await this.requestAuth("/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: this.session.refresh_token }
      });
      return this.saveSession({ ...refreshed, app_access: this.session.app_access }, this.remember);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  async getAccessToken() {
    return (await this.restoreSession())?.access_token ?? null;
  }

  async signOut() {
    const accessToken = this.session?.access_token;
    try {
      if (accessToken) await this.requestAuth("/logout", { method: "POST", accessToken });
    } finally {
      this.clearSession();
    }
  }

  async requestAuth(path, { method, body, accessToken } = {}) {
    const headers = { apikey: this.publishableKey, "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await this.fetchImpl(`${this.authUrl}${path}`, {
      method: method ?? "GET",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (!response.ok) throw new Error("No hemos podido iniciar la sesión segura. Comprueba la conexión y vuelve a intentarlo.");
    if (response.status === 204) return null;
    return response.json();
  }
}

export function createAuthService(config = globalThis.APP_CONFIG) {
  if (config?.dataSource !== "supabase" || !config?.supabaseUrl || !config?.supabasePublishableKey) return null;
  return new SupabaseAuthService(config.supabaseUrl, config.supabasePublishableKey);
}
