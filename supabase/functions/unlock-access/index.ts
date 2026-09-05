const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";

function firstConfiguredKey(jsonName: string, legacyName: string) {
  const legacyValue = Deno.env.get(legacyName);
  if (legacyValue) return legacyValue;
  try {
    const values = Object.values(JSON.parse(Deno.env.get(jsonName) ?? "{}"));
    return typeof values[0] === "string" ? values[0] : "";
  } catch {
    return "";
  }
}

const publishableKey = firstConfiguredKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const serviceRoleKey = firstConfiguredKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
const rateLimitPepper = Deno.env.get("RATE_LIMIT_PEPPER") ?? "";
const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") ?? "http://127.0.0.1:4173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return allowedOrigins.has(origin ?? "") ? new Response(null, { status: 204, headers: corsHeaders(origin) }) : json({ code: "ORIGIN_NOT_ALLOWED" }, 403, origin);
  }
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405, origin);
  if (!origin || !allowedOrigins.has(origin)) return json({ code: "ORIGIN_NOT_ALLOWED" }, 403, origin);
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !rateLimitPepper) {
    return json({ code: "SERVER_NOT_CONFIGURED" }, 500, origin);
  }

  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ code: "INVALID_SESSION" }, 401, origin);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization }
  });
  if (!userResponse.ok) return json({ code: "INVALID_SESSION" }, 401, origin);
  const user = await userResponse.json();
  if (!user?.id || user?.is_anonymous !== true) return json({ code: "INVALID_SESSION" }, 401, origin);

  let payload: { password?: unknown; remember?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ code: "INVALID_REQUEST" }, 400, origin);
  }
  if (typeof payload.password !== "string" || !payload.password.trim()) {
    return json({ code: "INVALID_REQUEST" }, 400, origin);
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress = request.headers.get("cf-connecting-ip") ?? forwardedFor ?? "unknown";
  const clientKey = await sha256(`${rateLimitPepper}:${clientAddress}`);
  const unlockResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/unlock_access`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_auth_user_id: user.id,
      p_password: payload.password,
      p_client_key: clientKey,
      p_remember: payload.remember === true
    })
  });
  if (!unlockResponse.ok) return json({ code: "ACCESS_SERVICE_ERROR" }, 500, origin);

  const result = await unlockResponse.json();
  if (!result?.ok) {
    const status = result?.code === "TOO_MANY_ATTEMPTS" ? 429 : 401;
    return json({ code: result?.code ?? "INVALID_CREDENTIALS" }, status, origin);
  }
  return json(result, 200, origin);
});
