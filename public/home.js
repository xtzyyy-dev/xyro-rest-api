"use strict";

(() => {
  const origin = location.origin;
  const SNIP = {
    express: [
      'import express from "express";',
      "",
      "const app = express();",
      `const API = "${origin}/api";`,
      "",
      'app.get("/time", async (req, res) => {',
      "  const r = await fetch(`${API}/time?tz=Asia/Jakarta`);",
      "  res.json(await r.json());",
      "});",
      "",
      "app.listen(3000);",
    ].join("\n"),
    fetch: [
      `const res = await fetch("${origin}/api/time?tz=Asia/Jakarta");`,
      "const data = await res.json();",
      "",
      "console.log(data);",
    ].join("\n"),
    curl: `curl "${origin}/api/time?tz=Asia/Jakarta"`,
  };

  let tab = "express";
  const code = $("#code");
  const out = $("#out");
  const meta = $("#runMeta");

  const show = () => {
    code.textContent = SNIP[tab];
    $$("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
  };
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; show(); }));
  show();

  async function run() {
    out.textContent = "Running…";
    const r = await api("/api/time?tz=Asia/Jakarta");
    out.textContent = r.ok ? JSON.stringify(r.data, null, 2) : `Request failed: ${r.data.message || r.status}`;
    meta.textContent = r.ok ? `${r.status} OK in ${r.ms} ms` : "Request failed";
  }
  $("#run").addEventListener("click", run);
  run();

  // Lighting beam follows the pointer.
  const hero = $("#hero");
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--lx", (((e.clientX - r.left) / r.width) * 100).toFixed(1));
  });

  // Live numbers.
  (async () => {
    const [eps, ping, price] = await Promise.all([api("/api/endpoints", INTERNAL), api("/api/ping", INTERNAL), api("/api/pricing", INTERNAL)]);
    if (eps.ok) $("#tileEp").textContent = eps.data.count;
    if (ping.ok) {
      $("#tileUp").textContent = "Operational";
      $("#tileUpSub").textContent = `${ping.ms} ms`;
      $("#heroStat").textContent = `Live now: ${eps.ok ? eps.data.count + " endpoints, " : ""}${ping.ms} ms from your location${ping.data.colo ? ", edge " + ping.data.colo : ""}.`;
    } else {
      $("#tileUp").textContent = "Unreachable";
      $("#heroStat").textContent = "The API did not respond. Check your deployment.";
    }
    if (price.ok) $("#tilePr").textContent = `From $${Math.min(...price.data.plans.map((p) => p.price))}`;
  })();
})();
