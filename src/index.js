import { ENDPOINTS, PLANS } from "./data.js";
export { Hub } from "./hub.js";

const VERSION = "1.0.0";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-hy-internal",
  "access-control-max-age": "86400",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS },
  });

const fail = (status, message) => json({ error: true, status, message }, status);

const hub = (env) => env.HUB.get(env.HUB.idFromName("global"));
const hubJson = async (env, path) => (await hub(env).fetch(`https://hub${path}`)).json();

const int = (value, fallback) => {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
};

// ---------- helpers ----------

async function sha(text, algo) {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function targetUrl(url) {
  const raw = url.searchParams.get("url");
  if (!raw) throw new HttpError(400, "Missing ?url= parameter.");
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid URL.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, "Only http and https URLs are allowed.");
  const h = u.hostname.toLowerCase();
  const blocked =
    h === "localhost" ||
    h === "[::1]" ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  if (blocked) throw new HttpError(400, "That host is not allowed.");
  return u;
}

async function fetchPage(u) {
  let res;
  try {
    res = await fetch(u, {
      headers: { "user-agent": "HeyyaryaBot/1.0", accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new HttpError(502, "Could not fetch that page.");
  }
  if (!(res.headers.get("content-type") || "").includes("html")) {
    throw new HttpError(415, "The page did not return HTML.");
  }
  return res;
}

// ---------- routes ----------

const routes = {
  "GET /api/ping": ({ cf }) => json({ ok: true, pong: Date.now(), colo: cf.colo ?? null }),

  "GET /api/status": async ({ env, cf }) => {
    let snap = null;
    try {
      snap = await hubJson(env, "/snapshot");
    } catch {}
    return json({
      status: snap ? "operational" : "degraded",
      service: "heyyarya-rest-api",
      version: VERSION,
      time: new Date().toISOString(),
      edge: { colo: cf.colo ?? null, country: cf.country ?? null, city: cf.city ?? null, region: cf.region ?? null },
      realtime: snap ? { clients: snap.clients, uptimeSeconds: snap.uptimeSeconds } : null,
      requests: snap ? { total: snap.total, perMinute: snap.perMinute } : null,
    });
  },

  "GET /api/endpoints": async ({ env }) => {
    const snap = await hubJson(env, "/snapshot");
    const endpoints = ENDPOINTS.map((e) => ({ ...e, hits: snap.hits[`${e.method} ${e.path}`] || 0 }));
    return json({ count: endpoints.length, endpoints });
  },

  "GET /api/top": async ({ env, url }) => {
    const limit = Math.min(Math.max(int(url.searchParams.get("limit"), 10), 1), 50);
    return json(await hubJson(env, `/top?limit=${limit}`));
  },

  "GET /api/uptime": async ({ env }) => {
    let snap = null;
    try {
      snap = await hubJson(env, "/snapshot");
    } catch {}
    return json({
      since: snap ? new Date(snap.startedAt).toISOString() : null,
      services: [
        { name: "API", status: "operational" },
        { name: "Realtime hub", status: snap ? "operational" : "down" },
      ],
    });
  },

  "GET /api/pricing": () => json({ currency: "USD", plans: PLANS }),

  "GET /api/notifications": async ({ env }) => json(await hubJson(env, "/notes")),

  "GET /api/time": ({ url }) => {
    const tz = url.searchParams.get("tz") || "UTC";
    const now = new Date();
    let local;
    try {
      local = new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "full", timeStyle: "long" }).format(now);
    } catch {
      throw new HttpError(400, `Unknown time zone: ${tz}`);
    }
    return json({ iso: now.toISOString(), unix: Math.floor(now.getTime() / 1000), timezone: tz, local });
  },

  "GET /api/ip": ({ request, cf }) =>
    json({
      ip: request.headers.get("cf-connecting-ip"),
      country: cf.country ?? null,
      city: cf.city ?? null,
      region: cf.region ?? null,
      timezone: cf.timezone ?? null,
      asn: cf.asn ?? null,
      colo: cf.colo ?? null,
    }),

  "GET /api/uuid": ({ url }) => {
    const count = Math.min(Math.max(int(url.searchParams.get("count"), 1), 1), 20);
    const uuids = Array.from({ length: count }, () => crypto.randomUUID());
    return json(count === 1 ? { uuid: uuids[0] } : { count, uuids });
  },

  "GET /api/random": ({ url }) => {
    const min = int(url.searchParams.get("min"), 0);
    const max = int(url.searchParams.get("max"), 100);
    if (min > max) throw new HttpError(400, "min must be less than or equal to max.");
    if (Math.abs(min) > 1e9 || Math.abs(max) > 1e9) throw new HttpError(400, "min and max must be within 1,000,000,000.");
    const span = max - min + 1;
    const value = min + (crypto.getRandomValues(new Uint32Array(1))[0] % span);
    return json({ min, max, value });
  },

  "GET /api/hash": async ({ url }) => {
    const text = url.searchParams.get("text");
    if (text === null) throw new HttpError(400, "Missing ?text= parameter.");
    if (text.length > 10000) throw new HttpError(413, "Text is limited to 10,000 characters.");
    const algos = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
    const key = (url.searchParams.get("algo") || "sha256").toLowerCase();
    if (!algos[key]) throw new HttpError(400, "algo must be sha1, sha256, sha384 or sha512.");
    return json({ algo: key, hash: await sha(text, algos[key]) });
  },

  "GET /api/base64": ({ url }) => {
    const text = url.searchParams.get("text");
    if (text === null) throw new HttpError(400, "Missing ?text= parameter.");
    if (text.length > 4096) throw new HttpError(413, "Text is limited to 4,096 characters.");
    const mode = (url.searchParams.get("mode") || "encode").toLowerCase();
    if (mode === "encode") {
      return json({ mode, result: btoa(String.fromCharCode(...new TextEncoder().encode(text))) });
    }
    if (mode === "decode") {
      try {
        const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
        return json({ mode, result: new TextDecoder().decode(bytes) });
      } catch {
        throw new HttpError(400, "Input is not valid Base64.");
      }
    }
    throw new HttpError(400, "mode must be encode or decode.");
  },

  "POST /api/echo": async ({ request, cf }) => {
    const raw = await request.text();
    if (raw.length > 65536) throw new HttpError(413, "Body is limited to 64 KB.");
    let body = raw;
    try {
      body = JSON.parse(raw);
    } catch {}
    return json({
      method: request.method,
      contentType: request.headers.get("content-type"),
      receivedBytes: raw.length,
      body,
      colo: cf.colo ?? null,
    });
  },

  "GET /api/scrape/meta": async ({ url }) => {
    const u = targetUrl(url);
    const res = await fetchPage(u);
    const base = res.url || u.href;
    const out = { url: u.href, finalUrl: base, status: res.status, title: null, description: null, image: null, siteName: null, canonical: null, icon: null };
    let title = "";
    const abs = (v) => {
      try {
        return new URL(v, base).href;
      } catch {
        return v;
      }
    };
    await new HTMLRewriter()
      .on("title", { text(t) { title += t.text; } })
      .on("meta", {
        element(e) {
          const name = (e.getAttribute("property") || e.getAttribute("name") || "").toLowerCase();
          const content = e.getAttribute("content");
          if (!content) return;
          if (name === "description" || name === "og:description") out.description ||= content;
          if (name === "og:image") out.image ||= abs(content);
          if (name === "og:site_name") out.siteName ||= content;
          if (name === "og:title") out.ogTitle ||= content;
        },
      })
      .on("link", {
        element(e) {
          const rel = (e.getAttribute("rel") || "").toLowerCase();
          const href = e.getAttribute("href");
          if (!href) return;
          if (rel === "canonical") out.canonical ||= abs(href);
          if (rel.includes("icon")) out.icon ||= abs(href);
        },
      })
      .transform(res)
      .arrayBuffer();
    out.title = title.trim() || out.ogTitle || null;
    return json(out);
  },

  "GET /api/scrape/links": async ({ url }) => {
    const u = targetUrl(url);
    const res = await fetchPage(u);
    const base = res.url || u.href;
    const found = new Set();
    await new HTMLRewriter()
      .on("a[href]", {
        element(e) {
          try {
            const h = new URL(e.getAttribute("href"), base);
            if (/^https?:$/.test(h.protocol)) {
              h.hash = "";
              found.add(h.href);
            }
          } catch {}
        },
      })
      .transform(res)
      .arrayBuffer();
    const links = [...found];
    return json({ url: u.href, status: res.status, count: links.length, links: links.slice(0, 200) });
  },
};

// ---------- entry ----------

export default {
  async fetch(request, env, ectx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const cf = request.cf || {};

    if (url.pathname === "/api/stream" && request.method === "GET") {
      const qs = new URLSearchParams({ colo: cf.colo || "", country: cf.country || "", city: cf.city || "" });
      const upstream = await hub(env).fetch(`https://hub/stream?${qs}`);
      const headers = new Headers(upstream.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      return new Response(upstream.body, { status: 200, headers });
    }

    const key = `${request.method} ${url.pathname}`;
    const handler = routes[key];
    if (!handler) return fail(404, `No endpoint for ${key}. See /api/endpoints for the full list.`);

    // Dashboard polling sends x-hy-internal so it does not inflate the hit counters.
    if (request.headers.get("x-hy-internal") !== "1") {
      ectx.waitUntil(
        hub(env)
          .fetch("https://hub/track", { method: "POST", body: JSON.stringify({ key }) })
          .catch(() => {})
      );
    }

    try {
      return await handler({ request, url, env, cf });
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      return fail(500, "Something went wrong on the server.");
    }
  },
};
