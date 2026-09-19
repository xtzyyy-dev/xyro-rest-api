"use strict";

/* Dashboard: hash-routed views. Depends on app.js (helpers, login, notifications, SSE). */

const NAVICON = {
  status: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  top: '<path d="M5 21V11M12 21V3M19 21v-7"/>',
  endpoints: '<path d="M8 6l-6 6 6 6M16 6l6 6-6 6"/>',
  playground: '<path d="M7 4l13 8-13 8z"/>',
  scrapers: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>',
  uptime: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  notifications: ICONS.bell,
  keys: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  pricing: '<path d="M12 2v20M17 6H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
};
const navIcon = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">${NAVICON[k]}</svg>`;

const NAV = [
  { group: "Overview", items: [["status", "Server status"], ["top", "Top endpoints"]] },
  { group: "Build", items: [["endpoints", "Endpoints"], ["playground", "Playground"], ["scrapers", "Scrapers"]] },
  { group: "Monitor", items: [["uptime", "Uptime"], ["notifications", "Notifications"]] },
  { group: "Account", items: [["keys", "API keys"], ["pricing", "Pricing"], ["settings", "Settings"]] },
];

const ORIGIN = location.origin;
const S = { rtt: [], fails: 0, metrics: null, hello: null, pick: null, cache: null, cacheAt: 0, wasDown: false };

/* ---------- utils ---------- */
const fmt = (n) => new Intl.NumberFormat("en-US").format(n ?? 0);
const dur = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
};
const mt = (m) => `<span class="m ${m === "POST" ? "post" : ""}">${m}</span>`;
const pretty = (d) => (typeof d === "string" ? d : JSON.stringify(d, null, 2));
const wireRepo = () => $$("[data-repo]").forEach((a) => { a.href = REPO + (a.dataset.repo || ""); a.target = "_blank"; a.rel = "noopener"; });

async function getEndpoints(force) {
  if (!force && S.cache && Date.now() - S.cacheAt < 5000) return S.cache;
  const r = await api("/api/endpoints", INTERNAL);
  if (r.ok) { S.cache = r.data.endpoints; S.cacheAt = Date.now(); }
  return S.cache || [];
}

function spark(vals, w = 600, h = 150) {
  if (vals.length < 2) return `<p class="empty">Collecting samples…</p>`;
  const max = Math.max(...vals, 50);
  const step = w / (vals.length - 1);
  const pts = vals.map((v, i) => [i * step, h - 8 - (v / max) * (h - 22)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Response time over the last ${vals.length} checks">
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${w} ${h} L0 ${h}Z" fill="url(#sg)"/>
    <path d="${d}" fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderTop(el, items, limit) {
  if (!el) return;
  const list = (items || []).slice(0, limit);
  if (!list.length) {
    el.innerHTML = `<p class="empty">No traffic yet. Send a request from the <a class="link" href="#playground">Playground</a>.</p>`;
    return;
  }
  const max = list[0].hits || 1;
  el.innerHTML = list
    .map((t) => `<div class="rk"><div class="rk-h">${mt(t.method)}<code>${esc(t.path)}</code><b>${fmt(t.hits)}</b></div><div class="bar"><i style="width:${Math.max(3, (t.hits / max) * 100)}%"></i></div></div>`)
    .join("");
}

const rowEp = (e) => `<div class="row">${mt(e.method)}<code>${esc(e.path)}</code><span class="mut">${esc(e.category)}</span></div>`;
const stat = (label, id) => `<div class="stat"><span>${label}</span><b id="${id}">–</b></div>`;

function applyStatus() {
  const st = S.fails >= 3 ? "down" : S.fails > 0 ? "degraded" : S.rtt.length ? "ok" : "checking";
  const label = { ok: "Operational", degraded: "Degraded", down: "Down", checking: "Checking" }[st];
  const b = $("#stBadge");
  if (b) { b.dataset.s = st; $("#stText").textContent = label; }
  return st;
}

/* ---------- views ---------- */
const views = {};

views.status = () => ({
  title: "Server status",
  html: `
    <div class="page-h"><div><h1>Server status</h1><p>Live data from the edge, refreshed every 2 seconds.</p></div>
      <span class="badge" id="stBadge" data-s="checking"><i class="dot"></i><span id="stText">Checking</span></span></div>
    <div class="stats">
      ${stat("Requests served", "sTotal")}${stat("Requests per minute", "sRpm")}${stat("Response time", "sRtt")}
      ${stat("Edge location", "sEdge")}${stat("Hub uptime", "sHub")}${stat("Live clients", "sClients")}
    </div>
    <section class="card spot"><div class="card-h"><h2>Response time</h2><span class="mut" id="rttNow"></span></div><div id="chart"></div></section>
    <div class="two">
      <section class="card spot"><div class="card-h"><h2>Endpoint list</h2><a class="link" href="#endpoints">View all</a></div><div id="miniList"><p class="empty">Loading…</p></div></section>
      <section class="card spot"><div class="card-h"><h2>Top endpoints</h2><a class="link" href="#top">View all</a></div><div id="miniTop"></div></section>
    </div>`,
  mount() {
    const g = (id) => document.getElementById(id);
    const paintM = (m) => {
      if (!m || !g("sTotal")) return;
      g("sTotal").textContent = fmt(m.total);
      g("sRpm").textContent = fmt(m.perMinute);
      g("sHub").textContent = dur(m.uptimeSeconds);
      g("sClients").textContent = fmt(m.clients);
      renderTop(g("miniTop"), m.top, 5);
    };
    const paintR = () => {
      if (!g("sRtt")) return;
      const last = S.rtt.at(-1);
      g("sRtt").textContent = last != null ? `${last} ms` : "–";
      g("chart").innerHTML = spark(S.rtt);
      g("rttNow").textContent = S.rtt.length ? `average ${Math.round(S.rtt.reduce((a, b) => a + b, 0) / S.rtt.length)} ms over ${S.rtt.length} checks` : "";
      applyStatus();
    };
    const paintE = () => {
      const h = S.hello;
      if (h && g("sEdge")) g("sEdge").textContent = [h.colo, h.country].filter(Boolean).join(", ") || "–";
    };
    const offs = [on("metrics", paintM), on("rtt", paintR), on("hello", paintE)];
    paintM(S.metrics); paintR(); paintE();
    getEndpoints().then((list) => { if (g("miniList")) g("miniList").innerHTML = list.slice(0, 8).map(rowEp).join(""); });
    return () => offs.forEach((f) => f());
  },
});

views.top = () => ({
  title: "Top endpoints",
  html: `
    <div class="page-h"><div><h1>Top endpoints</h1><p>Ranked by requests since the counter started.</p></div>
      <span class="badge"><b id="tpTotal">0</b>&nbsp;total requests</span></div>
    <section class="card spot"><div id="tpList"><p class="empty">Loading…</p></div></section>`,
  mount() {
    const load = async () => {
      const r = await api("/api/top?limit=20", INTERNAL);
      if (!r.ok || !$("#tpList")) return;
      $("#tpTotal").textContent = fmt(r.data.total);
      renderTop($("#tpList"), r.data.top, 20);
    };
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  },
});

function epDoc(e) {
  const q = (e.params || []).filter((p) => p.example != null).map((p) => `${p.name}=${encodeURIComponent(p.example)}`).join("&");
  const u = ORIGIN + e.path + (q ? `?${q}` : "");
  let curl, second, secondLabel;
  if (e.live) {
    curl = `curl -N "${u}"`;
    secondLabel = "Browser (EventSource)";
    second = [`const es = new EventSource("${u}");`, `es.addEventListener("metrics", (e) => console.log(JSON.parse(e.data)));`].join("\n");
  } else if (e.method === "POST") {
    curl = `curl -X POST "${u}" \\\n  -H "content-type: application/json" \\\n  -d '${e.body || "{}"}'`;
    secondLabel = "Node.js / Express";
    second = [
      `app.post("/proxy", express.json(), async (req, res) => {`,
      `  const r = await fetch("${u}", {`,
      `    method: "POST",`,
      `    headers: { "content-type": "application/json" },`,
      `    body: JSON.stringify(req.body),`,
      `  });`,
      `  res.json(await r.json());`,
      `});`,
    ].join("\n");
  } else {
    curl = `curl "${u}"`;
    secondLabel = "Node.js / Express";
    second = [`app.get("/proxy", async (req, res) => {`, `  const r = await fetch("${u}");`, `  res.json(await r.json());`, `});`].join("\n");
  }
  const params = e.params.length
    ? `<table class="params">${e.params.map((p) => `<tr><td>${esc(p.name)}</td><td class="mut">${esc(p.note || "")}${p.example != null ? ` Example: <code>${esc(p.example)}</code>` : ""}</td></tr>`).join("")}</table>`
    : `<p class="mut">${e.method === "POST" ? "Send a JSON body." : "No parameters."}</p>`;
  return `<details class="ep spot"><summary>${mt(e.method)}<code>${esc(e.path)}</code><span class="desc">${esc(e.desc)}</span><span class="hits">${fmt(e.hits)} hits</span></summary>
    <div class="ep-b"><h4>Parameters</h4>${params}<h4>curl</h4><pre>${esc(curl)}</pre><h4>${secondLabel}</h4><pre>${esc(second)}</pre>
    ${e.live ? "" : `<div style="margin-top:16px"><a class="btn small ghost" href="#playground" data-pick="${esc(e.method + " " + e.path)}">Try it in the Playground</a></div>`}</div></details>`;
}

views.endpoints = () => ({
  title: "Endpoints",
  html: `
    <div class="page-h"><div><h1>Endpoints</h1><p>Every route with copy-ready examples for curl and Node.js.</p></div>
      <span class="badge"><b id="epCount">0</b>&nbsp;endpoints</span></div>
    <div class="tools"><input id="epSearch" type="search" placeholder="Search by path or description" aria-label="Search endpoints"><span id="epCats" style="display:contents"></span></div>
    <div id="epList"><p class="empty">Loading…</p></div>`,
  mount() {
    let list = [], cat = "All", q = "";
    const draw = () => {
      const shown = list.filter((e) => (cat === "All" || e.category === cat) && `${e.path} ${e.desc}`.toLowerCase().includes(q));
      $("#epCount").textContent = shown.length;
      $("#epList").innerHTML = shown.length ? shown.map(epDoc).join("") : `<p class="empty">No endpoint matches that search.</p>`;
      const cats = ["All", ...new Set(list.map((e) => e.category))];
      $("#epCats").innerHTML = cats.map((c) => `<button class="chip-btn" data-cat="${esc(c)}" aria-pressed="${c === cat}" type="button">${esc(c)}</button>`).join("");
    };
    const onInput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
    const onClick = (e) => {
      const b = e.target.closest("[data-cat]");
      if (b) { cat = b.dataset.cat; draw(); }
      const p = e.target.closest("[data-pick]");
      if (p) S.pick = p.dataset.pick;
    };
    $("#epSearch").addEventListener("input", onInput);
    $("#view").addEventListener("click", onClick);
    getEndpoints(true).then((l) => { list = l; if ($("#epList")) draw(); });
    return () => $("#view")?.removeEventListener("click", onClick);
  },
});

views.playground = () => ({
  title: "Playground",
  html: `
    <div class="page-h"><div><h1>Playground</h1><p>Send a real request and inspect the response. Requests sent here count toward Top endpoints.</p></div></div>
    <div class="pg">
      <section class="card"><label for="pgEp" style="margin-top:0">Endpoint</label><select id="pgEp"></select><div id="pgParams"></div><button class="btn" id="pgSend" type="button">Send request</button></section>
      <section class="card"><div class="card-h"><h2>Response</h2><span class="mut" id="pgMeta">Not sent yet</span></div><pre class="out" id="pgOut">Choose an endpoint and send a request.</pre></section>
    </div>`,
  mount() {
    let list = [];
    const cur = () => list.find((e) => `${e.method} ${e.path}` === $("#pgEp").value);
    const form = () => {
      const e = cur();
      if (!e) return;
      const fields = e.params.map((p, i) => `<label for="pp${i}">${esc(p.name)}${p.note ? ` <span class="fine">(${esc(p.note)})</span>` : ""}</label><input id="pp${i}" data-p="${esc(p.name)}" value="${esc(p.example ?? "")}">`).join("");
      const body = e.method === "POST" ? `<label for="pgBody">JSON body</label><textarea id="pgBody">${esc(e.body || "{}")}</textarea>` : "";
      $("#pgParams").innerHTML = fields + body || `<p class="mut" style="margin-top:14px">No parameters.</p>`;
    };
    const send = async () => {
      const e = cur();
      if (!e) return;
      const qs = new URLSearchParams();
      $$("[data-p]").forEach((i) => i.value !== "" && qs.set(i.dataset.p, i.value));
      const opts = e.method === "POST" ? { method: "POST", headers: { "content-type": "application/json" }, body: $("#pgBody").value } : {};
      $("#pgOut").textContent = "Sending…";
      const r = await api(e.path + (qs.toString() ? `?${qs}` : ""), opts);
      $("#pgMeta").textContent = `${r.status || "Network error"} in ${r.ms} ms`;
      $("#pgOut").textContent = pretty(r.data);
    };
    getEndpoints().then((l) => {
      list = l.filter((e) => !e.live);
      const sel = $("#pgEp");
      if (!sel) return;
      sel.innerHTML = list.map((e) => `<option value="${esc(e.method + " " + e.path)}">${esc(e.method + " " + e.path)}</option>`).join("");
      if (S.pick && list.some((e) => `${e.method} ${e.path}` === S.pick)) sel.value = S.pick;
      S.pick = null;
      form();
      sel.addEventListener("change", form);
      $("#pgSend").addEventListener("click", send);
    });
  },
});

views.scrapers = () => ({
  title: "Scrapers",
  html: `
    <div class="page-h"><div><h1>Scrapers</h1><p>Run a scraper from your browser. Only public HTML pages are supported.</p></div>
      <a class="btn ghost" data-repo="/pulls" href="#">Share yours</a></div>
    <section class="card">
      <div class="tools" style="margin-bottom:0"><button class="chip-btn" data-tool="meta" aria-pressed="true" type="button">Page metadata</button><button class="chip-btn" data-tool="links" aria-pressed="false" type="button">Link extractor</button></div>
      <label for="scUrl">Page URL</label><input id="scUrl" type="url" value="https://example.com" inputmode="url">
      <button class="btn" id="scRun" type="button" style="margin-top:20px">Run scraper</button>
    </section>
    <section class="card"><div class="card-h"><h2>Result</h2><span class="mut" id="scMeta">Not run yet</span></div><pre class="out" id="scOut">Pick a scraper, enter a URL and run it.</pre></section>`,
  mount() {
    let tool = "meta";
    $$("[data-tool]").forEach((b) => b.addEventListener("click", () => {
      tool = b.dataset.tool;
      $$("[data-tool]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    $("#scRun").addEventListener("click", async () => {
      const url = $("#scUrl").value.trim();
      if (!url) return;
      $("#scOut").textContent = "Running…";
      const r = await api(`/api/scrape/${tool}?url=${encodeURIComponent(url)}`);
      $("#scMeta").textContent = `${r.status || "Network error"} in ${r.ms} ms`;
      $("#scOut").textContent = pretty(r.data);
    });
  },
});

const PROBES = [["API ping", "/api/ping"], ["Time", "/api/time"], ["UUID", "/api/uuid"], ["Status", "/api/status"], ["Endpoint list", "/api/endpoints"]];

views.uptime = () => ({
  title: "Uptime",
  html: `
    <div class="page-h"><div><h1>Uptime</h1><p>Each check is a real request to the API, run every 15 seconds.</p></div>
      <button class="btn" id="upNow" type="button">Check now</button></div>
    <section class="card" id="upList"><p class="empty">Running first checks…</p></section>
    <p class="fine">History is kept in this browser while the dashboard is open.</p>`,
  mount() {
    const draw = () => {
      const hist = store.get("hy_up", {});
      if (!$("#upList")) return;
      $("#upList").innerHTML = PROBES.map(([name, path]) => {
        const h = hist[path] || [];
        const up = h.filter((x) => x[1]).length;
        const pct = h.length ? ((up / h.length) * 100).toFixed(1) : "–";
        const last = h.at(-1);
        const cells = Array.from({ length: 60 }, (_, i) => {
          const x = h[h.length - 60 + i];
          return x ? `<i class="${x[1] ? "" : "off"}" title="${x[1] ? x[2] + " ms" : "failed"}"></i>` : `<i class="none"></i>`;
        }).join("");
        return `<div class="svc"><div><b>${esc(name)}</b><small>${esc(path)}</small></div><div class="strip" role="img" aria-label="Last ${h.length} checks for ${esc(name)}">${cells}</div>
          <div style="text-align:right"><b>${pct}${h.length ? "%" : ""}</b><small>${last ? (last[1] ? last[2] + " ms" : "failed") : ""}</small></div></div>`;
      }).join("");
    };
    const check = async () => {
      const hist = store.get("hy_up", {});
      await Promise.all(PROBES.map(async ([name, path]) => {
        const r = await api(path, INTERNAL);
        const arr = (hist[path] = hist[path] || []);
        const prev = arr.at(-1);
        arr.push([Date.now(), r.ok ? 1 : 0, r.ms]);
        hist[path] = arr.slice(-60);
        if (prev && prev[1] && !r.ok) addNote({ level: "error", title: `${name} check failed`, body: `${path} did not respond as expected.` });
        if (prev && !prev[1] && r.ok) addNote({ level: "ok", title: `${name} recovered`, body: `${path} is responding again.` });
      }));
      store.set("hy_up", hist);
      draw();
    };
    draw();
    check();
    const t = setInterval(check, 15000);
    $("#upNow").addEventListener("click", check);
    return () => clearInterval(t);
  },
});

views.notifications = () => ({
  title: "Notifications",
  html: `
    <div class="page-h"><div><h1>Notifications</h1><p>Live alerts from the server and your health checks.</p></div>
      <div class="actions" style="margin:0"><button class="btn small" id="ntRead" type="button">Mark all read</button><button class="btn small ghost" id="ntClear" type="button">Clear all</button></div></div>
    <section class="card"><div id="ntList"></div></section>`,
  mount() {
    const draw = () => {
      if (!$("#ntList")) return;
      $("#ntList").innerHTML = noteList.length ? noteList.map(noteHTML).join("") : `<p class="empty">Nothing yet. New alerts appear here in real time.</p>`;
    };
    draw();
    $("#ntRead").addEventListener("click", () => { markAllRead(); draw(); });
    $("#ntClear").addEventListener("click", () => { clearNotes(); draw(); });
    return on("notes", draw);
  },
});

views.keys = () => {
  const u = store.get("hy_user", null);
  if (!u) {
    return {
      title: "API keys",
      html: `<div class="page-h"><div><h1>API keys</h1><p>Create keys to identify your apps.</p></div></div>
        <section class="card"><p class="empty">Log in to create API keys.</p><button class="btn" data-login type="button" style="margin-top:12px">Log in</button></section>`,
      mount: () => on("auth", route),
    };
  }
  return {
    title: "API keys",
    html: `
      <div class="page-h"><div><h1>API keys</h1><p>Signed in as ${esc(u.email)}.</p></div></div>
      <section class="card"><label for="kName" style="margin-top:0">Key name</label><input id="kName" placeholder="My Express server" maxlength="40">
        <button class="btn" id="kMake" type="button" style="margin-top:20px">Create key</button></section>
      <section class="card"><div class="card-h"><h2>Your keys</h2></div><div id="kList"></div></section>
      <p class="fine">Keys are generated and stored in this browser for the demo. To enforce them, check the key in src/index.js before running a handler.</p>`,
    mount() {
      const draw = () => {
        const keys = store.get("hy_keys", []);
        $("#kList").innerHTML = keys.length
          ? keys.map((k) => `<div class="key"><div><b>${esc(k.name)}</b><br><code>${esc(k.key.slice(0, 8))}••••••••${esc(k.key.slice(-4))}</code></div><button class="btn small ghost" data-copy="${esc(k.id)}" type="button">Copy</button><button class="btn small ghost" data-revoke="${esc(k.id)}" type="button">Revoke</button></div>`).join("")
          : `<p class="empty">No keys yet. Create your first one above.</p>`;
      };
      const click = (e) => {
        const keys = store.get("hy_keys", []);
        if (e.target.closest("#kMake")) {
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          const key = "hy_live_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
          keys.unshift({ id: String(Date.now()), name: $("#kName").value.trim() || "Untitled key", key });
          store.set("hy_keys", keys); $("#kName").value = ""; draw(); toast("Key created", "Copy it now and keep it safe.");
        }
        const c = e.target.closest("[data-copy]");
        if (c) { const k = keys.find((x) => x.id === c.dataset.copy); navigator.clipboard?.writeText(k.key).then(() => toast("Copied", k.name)); }
        const r = e.target.closest("[data-revoke]");
        if (r) { store.set("hy_keys", keys.filter((x) => x.id !== r.dataset.revoke)); draw(); toast("Key revoked", ""); }
      };
      draw();
      $("#view").addEventListener("click", click);
      const off = on("auth", route);
      return () => { $("#view")?.removeEventListener("click", click); off(); };
    },
  };
};

views.pricing = () => ({
  title: "Pricing",
  html: `
    <div class="page-h"><div><h1>Pricing</h1><p>Start free. Move up when your traffic does.</p></div></div>
    <div class="plans" id="plans"><p class="empty" style="padding:24px;background:#000">Loading…</p></div>`,
  mount() {
    api("/api/pricing", INTERNAL).then((r) => {
      if (!r.ok || !$("#plans")) return;
      $("#plans").innerHTML = r.data.plans.map((p) => `
        <article class="plan ${p.featured ? "featured" : ""}"><h2>${esc(p.name)}</h2><p class="mut">${esc(p.tagline)}</p>
          <p class="price">$${p.price}<small> per ${esc(p.period)}</small></p>
          <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
          <button class="btn" data-login type="button">${esc(p.cta)}</button></article>`).join("");
    });
  },
});

views.settings = () => ({
  title: "Settings",
  html: `
    <div class="page-h"><div><h1>Settings</h1><p>Control live updates and local data.</p></div></div>
    <section class="card">
      <div class="setting"><div><label for="stLive">Live stream</label><p>Receive metrics and alerts in real time. Turning it off applies to this session.</p></div><input id="stLive" type="checkbox" ${es ? "checked" : ""}></div>
      <div class="setting"><div><label for="stToast">Toast alerts</label><p>Show a pop-up when a new notification arrives.</p></div><input id="stToast" type="checkbox" ${store.get("hy_toasts", true) ? "checked" : ""}></div>
      <div class="setting"><div><label>Local data</label><p>Removes your login, keys, notifications and uptime history from this browser.</p></div><button class="btn small ghost" id="stClear" type="button">Clear data</button></div>
    </section>`,
  mount() {
    $("#stLive").addEventListener("change", (e) => (e.target.checked ? connectStream() : disconnectStream()));
    $("#stToast").addEventListener("change", (e) => store.set("hy_toasts", e.target.checked));
    $("#stClear").addEventListener("click", () => {
      ["hy_user", "hy_keys", "hy_notes", "hy_up", "hy_toasts"].forEach(store.del);
      location.reload();
    });
  },
});

/* ---------- router ---------- */
let cleanup = null;
function route() {
  const id = (location.hash || "#status").slice(1);
  const key = views[id] ? id : "status";
  if (cleanup) { cleanup(); cleanup = null; }
  const def = views[key]();
  $("#view").innerHTML = def.html;
  $("#crumb").textContent = def.title;
  document.title = `${def.title} - Heyyarya`;
  $$(".nl").forEach((a) => (a.dataset.v === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  wireRepo();
  cleanup = (def.mount && def.mount()) || null;
  closeMenu();
  window.scrollTo(0, 0);
}

function closeMenu() { $("#side").classList.remove("open"); $(".scrim")?.remove(); }
function openMenu() {
  $("#side").classList.add("open");
  const s = document.createElement("div");
  s.className = "scrim";
  s.addEventListener("click", closeMenu);
  document.body.append(s);
}

/* ---------- boot ---------- */
$("#nav").innerHTML = NAV.map((g) => `<p class="grp">${g.group}</p>` + g.items.map(([id, label]) => `<a class="nl" href="#${id}" data-v="${id}">${navIcon(id)}<span>${label}</span></a>`).join("")).join("");
$("#menuBtn").innerHTML = icon("menu");
$("#menuBtn").addEventListener("click", openMenu);

on("metrics", (m) => (S.metrics = m));
on("hello", (h) => {
  S.hello = h;
  $("#sideFoot").textContent = `Connected to edge ${[h.colo, h.country].filter(Boolean).join(", ") || "network"}.`;
});
on("live", (v) => { if (!v) $("#sideFoot").textContent = "Reconnecting to the live stream…"; });

async function rttLoop() {
  const r = await api("/api/ping", INTERNAL);
  if (r.ok) {
    S.fails = 0;
    S.rtt.push(r.ms);
    if (S.rtt.length > 40) S.rtt.shift();
    if (S.wasDown) { S.wasDown = false; addNote({ level: "ok", title: "API recovered", body: "Health checks are passing again." }); }
  } else {
    S.fails += 1;
    if (S.fails === 3 && !S.wasDown) { S.wasDown = true; addNote({ level: "error", title: "API unreachable", body: "Three health checks in a row failed." }); }
  }
  emit("rtt");
  setTimeout(rttLoop, 3000);
}

window.addEventListener("hashchange", route);
route();
rttLoop();
