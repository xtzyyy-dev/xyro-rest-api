// Contoh memakai Heyyarya Rest API dari server Node.js + Express.
// Jalankan: npm i express && node express.mjs
import express from "express";

const API = process.env.HEYYARYA_URL || "https://heyyarya-rest-api.YOUR-SUBDOMAIN.workers.dev/api";
const app = express();

app.get("/time", async (req, res) => {
  const tz = req.query.tz || "Asia/Jakarta";
  const r = await fetch(`${API}/time?tz=${encodeURIComponent(tz)}`);
  res.status(r.status).json(await r.json());
});

app.get("/meta", async (req, res) => {
  const r = await fetch(`${API}/scrape/meta?url=${encodeURIComponent(req.query.url || "https://example.com")}`);
  res.status(r.status).json(await r.json());
});

app.post("/echo", express.json(), async (req, res) => {
  const r = await fetch(`${API}/echo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req.body),
  });
  res.status(r.status).json(await r.json());
});

app.listen(3000, () => console.log("http://localhost:3000"));
