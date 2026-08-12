import app from "./index.js";

function normalizeSetupToken(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "");
}

function envWithNormalizedSetupToken(env) {
  const normalized = normalizeSetupToken(env.SETUP_TOKEN);
  return new Proxy(env, {
    get(target, prop, receiver) {
      if (prop === "SETUP_TOKEN") return normalized;
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function normalizeSetupRequest(request) {
  const data = await request.clone().json();
  const supplied = normalizeSetupToken(
    request.headers.get("x-setup-token") || data.setupToken || "",
  );

  data.setupToken = supplied;

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("x-setup-token", supplied);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(data),
    redirect: request.redirect,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/setup" && request.method.toUpperCase() === "POST") {
      try {
        const normalizedRequest = await normalizeSetupRequest(request);
        const normalizedEnv = envWithNormalizedSetupToken(env);
        return await app.fetch(normalizedRequest, normalizedEnv, ctx);
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
