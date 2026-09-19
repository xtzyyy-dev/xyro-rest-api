// Hub: satu Durable Object global.
// - menghitung request per endpoint (dipakai Top endpoints)
// - mendorong metrik dan notifikasi ke semua klien lewat Server-Sent Events

const enc = new TextEncoder();
const STREAM_LIFETIME_MS = 5 * 60 * 1000; // EventSource akan otomatis tersambung ulang
const PULSE_MS = 2000;
const NOTE_EVERY_TICKS = 8; // notifikasi tiap ~16 detik saat ada klien

export class Hub {
  constructor(state) {
    this.state = state;
    this.hits = {};
    this.total = 0;
    this.stamps = [];
    this.subs = new Set();
    this.notes = [];
    this.startedAt = Date.now();
    this.timer = null;
    this.tick = 0;
    this.noteIndex = 0;
    this.lastFlush = 0;

    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get(["hits", "total"]);
      this.hits = saved.get("hits") || {};
      this.total = saved.get("total") || 0;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/track": {
        const { key } = await request.json();
        this.track(String(key).slice(0, 120));
        return new Response(null, { status: 204 });
      }
      case "/snapshot":
        return Response.json(this.snapshot());
      case "/top": {
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 1), 50);
        return Response.json({ total: this.total, top: this.top(limit) });
      }
      case "/notes":
        return Response.json({ notifications: this.notes });
      case "/stream":
        return this.stream(url);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  track(key) {
    this.hits[key] = (this.hits[key] || 0) + 1;
    this.total += 1;
    this.stamps.push(Date.now());
    this.trim();
    if (Date.now() - this.lastFlush > 10_000) {
      this.lastFlush = Date.now();
      this.state.storage.put({ hits: this.hits, total: this.total });
    }
  }

  trim() {
    const cut = Date.now() - 60_000;
    while (this.stamps.length && this.stamps[0] < cut) this.stamps.shift();
  }

  top(limit) {
    return Object.entries(this.hits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, hits]) => {
        const i = key.indexOf(" ");
        return { method: key.slice(0, i), path: key.slice(i + 1), hits };
      });
  }

  snapshot() {
    this.trim();
    return {
      total: this.total,
      perMinute: this.stamps.length,
      hits: this.hits,
      clients: this.subs.size,
      startedAt: this.startedAt,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  metrics() {
    const { hits, startedAt, ...rest } = this.snapshot();
    return { t: Date.now(), ...rest, top: this.top(5) };
  }

  stream(url) {
    const { readable, writable } = new TransformStream();
    const sub = { w: writable.getWriter(), until: Date.now() + STREAM_LIFETIME_MS };
    this.subs.add(sub);

    sub.w.write(enc.encode("retry: 3000\n\n")).catch(() => this.drop(sub));
    this.send(sub, "hello", {
      colo: url.searchParams.get("colo") || null,
      country: url.searchParams.get("country") || null,
      city: url.searchParams.get("city") || null,
    });
    this.send(sub, "metrics", this.metrics());

    if (!this.timer) this.timer = setInterval(() => this.pulse(), PULSE_MS);

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    });
  }

  send(sub, event, data) {
    sub.w
      .write(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      .catch(() => this.drop(sub));
  }

  drop(sub) {
    if (!this.subs.delete(sub)) return;
    sub.w.close().catch(() => {});
    if (this.subs.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  pulse() {
    this.tick += 1;
    const now = Date.now();
    for (const sub of [...this.subs]) if (sub.until < now) this.drop(sub);
    if (this.subs.size === 0) return;

    const m = this.metrics();
    for (const sub of this.subs) this.send(sub, "metrics", m);

    if (this.tick % NOTE_EVERY_TICKS === 0) {
      const note = this.makeNote(m);
      this.notes.unshift(note);
      this.notes = this.notes.slice(0, 20);
      for (const sub of this.subs) this.send(sub, "notification", note);
    }
  }

  makeNote(m) {
    const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
    const lead = m.top[0];
    const options = [
      () => ({ level: "info", title: "Traffic", body: `${plural(m.perMinute, "request")} in the last minute.` }),
      () =>
        lead
          ? { level: "info", title: "Top endpoint", body: `${lead.method} ${lead.path} leads with ${plural(lead.hits, "hit")}.` }
          : { level: "info", title: "Waiting for traffic", body: "No requests recorded yet. Send one from the Playground." },
      () => ({ level: "ok", title: "Realtime hub", body: `${plural(m.clients, "client")} connected to the live stream.` }),
    ];
    const pick = options[this.noteIndex++ % options.length]();
    return { id: `n${Date.now()}`, t: Date.now(), ...pick };
  }
}
