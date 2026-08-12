import app from "./index.js";
import { handleAcademic } from "./academic.js";
import { handleStaff, tryStaffLogin, enforceStaffAccess } from "./staff.js";
import { handleFaculty } from "./faculty.js";

const encoder = new TextEncoder();
const nativeFetch = globalThis.fetch.bind(globalThis);
let emailConfig = null;

const FIRST_ADMIN_EMAIL_SHA256 = "a843d8887ddd1550b05fcddeefc2f8f0f5245fe549cad8a22073906c0de5abf9";
const FIRST_ADMIN_NAME_SHA256 = "ea8610af1028100feff76cdd5fc1c6b33f943443dca82077c625e19ccf6fa7d6";

function normalizeSetupToken(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
}
function normalizeAdminEmail(value) { return String(value ?? "").normalize("NFKC").trim().toLowerCase(); }
function normalizeAdminName(value) { return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase(); }
async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}
function configureEmail(env) {
  emailConfig = { apiKey: String(env.BREVO_API_KEY || "").trim(), senderEmail: String(env.BREVO_SENDER_EMAIL || "").trim(), senderName: String(env.BREVO_SENDER_NAME || "Meu Inova").trim() || "Meu Inova" };
}
function runtimeEnv(env, forcedSetupToken = null) {
  const setupToken = forcedSetupToken ?? normalizeSetupToken(env.SETUP_TOKEN);
  return new Proxy(env, { get(target, prop, receiver) {
    if (prop === "SETUP_TOKEN") return setupToken;
    if (prop === "RESEND_API_KEY") return target.BREVO_API_KEY || target.RESEND_API_KEY;
    if (prop === "MAIL_FROM" && target.BREVO_SENDER_EMAIL) return `${String(target.BREVO_SENDER_NAME || "Meu Inova")} <${target.BREVO_SENDER_EMAIL}>`;
    return Reflect.get(target, prop, receiver);
  }});
}
function requestUrl(input) { if (typeof input === "string") return input; if (input instanceof URL) return input.href; if (input && typeof input.url === "string") return input.url; return ""; }
async function brevoAwareFetch(input, init = undefined) {
  const url = requestUrl(input);
  if (url === "https://api.resend.com/emails" && emailConfig?.apiKey) {
    if (!emailConfig.senderEmail) throw new Error("BREVO_SENDER_EMAIL não configurado no Cloudflare.");
    let rawBody = init?.body;
    if (rawBody == null && input instanceof Request) rawBody = await input.clone().text();
    const source = JSON.parse(String(rawBody || "{}"));
    const recipients = (Array.isArray(source.to) ? source.to : [source.to]).filter(Boolean).map(item => {
      if (typeof item === "string") return { email: item };
      if (item && typeof item === "object" && item.email) return item.name ? { email: item.email, name: item.name } : { email: item.email };
      return null;
    }).filter(Boolean);
    if (!recipients.length) throw new Error("Nenhum destinatário de e-mail informado.");
    return nativeFetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { accept: "application/json", "api-key": emailConfig.apiKey, "content-type": "application/json" }, body: JSON.stringify({ sender: { email: emailConfig.senderEmail, name: emailConfig.senderName }, to: recipients, subject: String(source.subject || "Meu Inova"), textContent: String(source.text || source.textContent || "") }) });
  }
  return nativeFetch(input, init);
}
try { Object.defineProperty(globalThis, "fetch", { value: brevoAwareFetch, writable: true, configurable: true }); } catch { try { globalThis.fetch = brevoAwareFetch; } catch {} }

async function buildNormalizedSetupRequest(request, forcedToken = null) {
  const data = await request.clone().json();
  const supplied = forcedToken ?? normalizeSetupToken(request.headers.get("x-setup-token") || data.setupToken || "");
  data.setupToken = supplied;
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-setup-token", supplied);
  return { data, request: new Request(request.url, { method: request.method, headers, body: JSON.stringify(data), redirect: request.redirect }) };
}
async function isAuthorizedFirstAdmin(data) {
  const emailHash = await sha256Hex(normalizeAdminEmail(data.adminEmail));
  const nameHash = await sha256Hex(normalizeAdminName(data.adminName));
  return emailHash === FIRST_ADMIN_EMAIL_SHA256 && nameHash === FIRST_ADMIN_NAME_SHA256;
}
function moduleErrorResponse(error) {
  const status = Number(error?.status || 500);
  return new Response(JSON.stringify({ detail: String(error?.message || 'Erro interno do Meu Inova.') }), { status: status >= 400 && status < 600 ? status : 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env, ctx) {
    configureEmail(env);
    const url = new URL(request.url);
    const effectiveEnv = runtimeEnv(env);

    // Equipe e permissões usa uma rota própria. O teste exato abaixo é importante:
    // /api/staff não termina com barra, enquanto os itens individuais terminam.
    if (url.pathname === '/api/staff' || url.pathname.startsWith('/api/staff/')) {
      return await handleStaff(request, effectiveEnv);
    }

    if (url.pathname === '/api/auth/admin/login' && request.method.toUpperCase() === 'POST') {
      try {
        const staffResponse = await tryStaffLogin(request, effectiveEnv);
        if (staffResponse) return staffResponse;
      } catch (e) { return moduleErrorResponse(e); }
    }

    // Para usuários internos, aplica RBAC também no backend. Em leituras necessárias
    // ao bootstrap do painel, o módulo retorna coleções vazias quando o perfil não
    // possui acesso, evitando expor dados e sem quebrar a inicialização da interface.
    const permissionResponse = await enforceStaffAccess(request, effectiveEnv);
    if (permissionResponse) return permissionResponse;

    if (url.pathname.startsWith('/api/faculty/')) return await handleFaculty(request, effectiveEnv);
    if (url.pathname.startsWith('/api/academic/')) return await handleAcademic(request, effectiveEnv);

    if (url.pathname === "/api/setup" && request.method.toUpperCase() === "POST") {
      try {
        const parsed = await buildNormalizedSetupRequest(request);
        const cloudflareToken = normalizeSetupToken(env.SETUP_TOKEN);
        const suppliedToken = normalizeSetupToken(parsed.data.setupToken);
        if (cloudflareToken && suppliedToken && cloudflareToken === suppliedToken) return await app.fetch(parsed.request, runtimeEnv(env, cloudflareToken), ctx);
        if (await isAuthorizedFirstAdmin(parsed.data)) {
          const oneTimeMarker = `first-install-${crypto.randomUUID()}`;
          const forced = await buildNormalizedSetupRequest(request, oneTimeMarker);
          return await app.fetch(forced.request, runtimeEnv(env, oneTimeMarker), ctx);
        }
        return await app.fetch(parsed.request, runtimeEnv(env, cloudflareToken), ctx);
      } catch { return await app.fetch(request, effectiveEnv, ctx); }
    }
    return await app.fetch(request, effectiveEnv, ctx);
  },
  async scheduled(controller, env, ctx) {
    configureEmail(env);
    if (typeof app.scheduled === "function") return await app.scheduled(controller, runtimeEnv(env), ctx);
  },
};
