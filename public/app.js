"use strict";

/* Shared helpers for every Heyyarya page. */

// Ganti dengan URL repo GitHub kamu. Semua tombol "View on GitHub" ikut berubah.
const REPO = "https://github.com/YOUR-USERNAME/heyyarya-rest-api";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const bus = new EventTarget();
const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
const on = (name, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};

// Request internal: tidak dihitung ke statistik endpoint.
const INTERNAL = { headers: { "x-hy-internal": "1" } };

async function api(path, opts = {}) {
  const t = performance.now();
  try {
    const res = await fetch(path, opts);
    const ms = Math.round(performance.now() - t);
    const type = res.headers.get("content-type") || "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, ms, data };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t), data: { message: e.message } };
  }
}

const ICONS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
};
const icon = (k, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="square" aria-hidden="true">${ICONS[k] || ""}</svg>`;

function timeAgo(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function toast(title, body) {
  const box = $("#toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<b>${esc(title)}</b><span>${esc(body || "")}</span>`;
  box.append(el);
  setTimeout(() => el.remove(), 4500);
}

/* ---------- repo links + cursor lighting ---------- */
$$("[data-repo]").forEach((a) => { a.href = REPO + (a.dataset.repo || ""); a.target = "_blank"; a.rel = "noopener"; });
document.addEventListener("pointermove", (e) => {
  const el = e.target.closest && e.target.closest(".spot");
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
});

/* ---------- login (demo: disimpan di browser) ---------- */
function authUI() {
  const b = $("#loginBtn");
  if (!b) return;
  const u = store.get("hy_user", null);
  if (u) {
    b.innerHTML = `<span class="avatar" aria-hidden="true">${esc(u.email[0].toUpperCase())}</span><span class="lbl">${esc(u.email.split("@")[0])}</span>`;
    b.setAttribute("aria-label", "Account menu");
  } else {
    b.innerHTML = `${icon("user")}<span class="lbl">Log in</span>`;
    b.setAttribute("aria-label", "Log in");
  }
}

function openLogin() {
  const dlg = $("#loginDlg");
  if (!dlg || !dlg.showModal) return;
  const u = store.get("hy_user", null);
  dlg.innerHTML = u
    ? `<h2>Account</h2><p class="mut">Signed in as ${esc(u.email)}</p>
       <div class="dlg-actions"><button class="btn" id="logout" type="button">Log out</button><button class="btn ghost" data-close type="button">Close</button></div>`
    : `<form id="loginForm"><h2>Log in</h2><p class="mut">Enter your email to create keys and track your usage.</p>
       <label for="lgEmail">Email</label><input id="lgEmail" type="email" required autocomplete="email" placeholder="you@example.com">
       <div class="dlg-actions"><button class="btn" type="submit">Log in</button><button class="btn ghost" data-close type="button">Cancel</button></div>
       <p class="fine">Demo login. Your email stays in this browser only. Connect a real auth provider before accepting customers.</p></form>`;
  dlg.showModal();
  $("#lgEmail")?.focus();
}

document.addEventListener("click", (e) => {
  const login = e.target.closest("[data-login]");
  if (login) { e.preventDefault(); openLogin(); return; }
  if (e.target.closest("[data-close]")) $("#loginDlg")?.close();
  if (e.target.closest("#logout")) {
    store.del("hy_user"); authUI(); $("#loginDlg")?.close(); toast("Logged out", "See you soon.");
    emit("auth");
  }
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "loginForm") return;
  e.preventDefault();
  const email = $("#lgEmail").value.trim();
  if (!email) return;
  store.set("hy_user", { email });
  authUI(); $("#loginDlg").close(); toast("Logged in", email);
  emit("auth");
});

/* ---------- notifications ---------- */
let noteList = store.get("hy_notes", []);
const unread = () => noteList.filter((n) => !n.read).length;

function saveNotes() { store.set("hy_notes", noteList.slice(0, 40)); }

function addNote(n) {
  const id = n.id || `n${Date.now()}`;
  if (noteList.some((x) => x.id === id)) return;
  noteList.unshift({ id, t: n.t || Date.now(), level: n.level || "info", title: n.title, body: n.body, read: false });
  noteList = noteList.slice(0, 40);
  saveNotes(); updateBell(); renderNotifPanel();
  if (store.get("hy_toasts", true)) toast(n.title, n.body);
  emit("notes");
}
function markAllRead() { noteList.forEach((n) => (n.read = true)); saveNotes(); updateBell(); emit("notes"); }
function clearNotes() { noteList = []; saveNotes(); updateBell(); renderNotifPanel(); emit("notes"); }

function noteHTML(n) {
  return `<div class="nt" data-l="${esc(n.level)}" data-u="${n.read ? 0 : 1}"><i></i><div><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div><time>${timeAgo(n.t)}</time></div>`;
}

function updateBell() {
  const c = $("#bellCount");
  if (!c) return;
  const n = unread();
  c.hidden = n === 0;
  c.textContent = n > 9 ? "9+" : n;
  $("#bell")?.setAttribute("aria-label", n ? `Notifications, ${n} unread` : "Notifications");
}

function renderNotifPanel() {
  const p = $("#notifPanel");
  if (!p || p.hidden) return;
  p.innerHTML = `<div class="pop-h"><h2>Notifications</h2><span><button class="chip-btn" id="npRead" type="button">Mark read</button></span></div>` +
    (noteList.length ? noteList.slice(0, 12).map(noteHTML).join("") : `<p class="empty">Nothing yet. Live alerts show up here as they happen.</p>`) +
    `<div class="pop-h" style="border-top:1px solid var(--line);border-bottom:0"><a class="link" href="/dashboard#notifications">See all</a></div>`;
}

function initBell() {
  const bell = $("#bell"), panel = $("#notifPanel");
  if (!bell || !panel) return;
  bell.innerHTML = `${icon("bell")}<b id="bellCount" hidden>0</b>`;
  updateBell();
  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    bell.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) { renderNotifPanel(); setTimeout(markAllRead, 1200); }
  });
  panel.addEventListener("click", (e) => { e.stopPropagation(); if (e.target.closest("#npRead")) { markAllRead(); renderNotifPanel(); } });
  document.addEventListener("click", () => { panel.hidden = true; bell.setAttribute("aria-expanded", "false"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.hidden = true; });
}

/* ---------- real-time stream (SSE) ---------- */
let es = null;
function setLive(on_) {
  const el = $("#liveState");
  if (el) { el.dataset.on = on_ ? "1" : "0"; $(".txt", el).textContent = on_ ? "Live" : "Reconnecting"; }
  emit("live", on_);
}
function connectStream() {
  if (!("EventSource" in window) || es) return;
  es = new EventSource("/api/stream");
  es.addEventListener("open", () => setLive(true));
  es.addEventListener("error", () => setLive(false));
  es.addEventListener("hello", (e) => emit("hello", JSON.parse(e.data)));
  es.addEventListener("metrics", (e) => emit("metrics", JSON.parse(e.data)));
  es.addEventListener("notification", (e) => { const n = JSON.parse(e.data); addNote(n); emit("notification", n); });
}
function disconnectStream() { if (es) { es.close(); es = null; setLive(false); } }

/* ---------- boot ---------- */
authUI();
initBell();
if (document.body.dataset.live !== undefined) {
  connectStream();
  api("/api/notifications", INTERNAL).then((r) => {
    if (r.ok && Array.isArray(r.data.notifications)) {
      const seen = new Set(noteList.map((n) => n.id));
      r.data.notifications.filter((n) => !seen.has(n.id)).reverse().forEach((n) => {
        noteList.unshift({ ...n, read: true });
      });
      noteList = noteList.slice(0, 40); saveNotes(); updateBell();
    }
  });
}
