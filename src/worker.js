import app from "./index.js";

const encoder = new TextEncoder();

// Temporary first-install guard.
// Only SHA-256 fingerprints are stored in the public repository; the actual
// administrator name/email are not embedded here. Once the first admin exists,
// index.js permanently blocks /api/setup with HTTP 409.
const FIRST_ADMIN_EMAIL_SHA256 = "a843d8887ddd1550b05fcddeefc2f8f0f5245fe549cad8a22073906c0de5abf9";
const FIRST_ADMIN_NAME_SHA256 = "ea8610af1028100feff76cdd5fc1c6b33f943443dca82077c625e19ccf6fa7d6";

function normalizeSetupToken(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
}

function normalizeAdminEmail(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase();
}

function normalizeAdminName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function sha256Hex(value) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(String(value))),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function envWithSetupToken(env, token) {
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === "SETUP_TOKEN") return token;
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function buildNormalizedSetupRequest(request, forcedToken = null) {
  const data = await request.clone().json();
  const supplied = forcedToken ?? normalizeSetupToken(
    request.headers.get("x-setup-token") || data.setupToken || "",
  );

  data.setupToken = supplied;

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-setup-token", supplied);

  return {
    data,
    request: new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify(data),
      redirect: request.redirect,
    }),
  };
}

async function isAuthorizedFirstAdmin(data) {
  const emailHash = await sha256Hex(normalizeAdminEmail(data.adminEmail));
  const nameHash = await sha256Hex(normalizeAdminName(data.adminName));
  return emailHash === FIRST_ADMIN_EMAIL_SHA256 && nameHash === FIRST_ADMIN_NAME_SHA256;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/setup" && request.method.toUpperCase() === "POST") {
      try {
        const parsed = await buildNormalizedSetupRequest(request);

        // Normal path: use the SETUP_TOKEN from Cloudflare after normalization.
        const cloudflareToken = normalizeSetupToken(env.SETUP_TOKEN);
        const suppliedToken = normalizeSetupToken(parsed.data.setupToken);
        if (cloudflareToken && suppliedToken && cloudflareToken === suppliedToken) {
          const normalizedEnv = envWithSetupToken(env, cloudflareToken);
          return await app.fetch(parsed.request, normalizedEnv, ctx);
        }

        // Recovery path for this first deployment only. It does not make setup
        // generally public: the submitted admin identity must match the two
        // SHA-256 fingerprints above. index.js still checks that no administrator
        // exists before inserting anything, so this path becomes unusable after
        // the first successful installation.
        if (await isAuthorizedFirstAdmin(parsed.data)) {
          const oneTimeMarker = `first-install-${crypto.randomUUID()}`;
          const forced = await buildNormalizedSetupRequest(request, oneTimeMarker);
          const guardedEnv = envWithSetupToken(env, oneTimeMarker);
          return await app.fetch(forced.request, guardedEnv, ctx);
        }

        return await app.fetch(parsed.request, envWithSetupToken(env, cloudflareToken), ctx);
      } catch {
        return await app.fetch(request, env, ctx);
      }
    }

    return await app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (typeof app.scheduled === "function") {
      return await app.scheduled(controller, env, ctx);
    }
  },
};
