// Satu sumber data untuk daftar endpoint. Dashboard membaca dari sini lewat /api/endpoints.
// Tambah endpoint baru: tambahkan objek di sini dan handler di src/index.js.

export const ENDPOINTS = [
  { method: "GET", path: "/api/ping", category: "System", desc: "Health check with the edge timestamp.", params: [] },
  { method: "GET", path: "/api/status", category: "System", desc: "Server status, edge location and live counters.", params: [] },
  { method: "GET", path: "/api/endpoints", category: "System", desc: "Full endpoint list with hit counts.", params: [] },
  { method: "GET", path: "/api/top", category: "System", desc: "Most used endpoints, ranked by hits.", params: [{ name: "limit", example: "10", note: "1 to 50" }] },
  { method: "GET", path: "/api/uptime", category: "System", desc: "Service health and hub start time.", params: [] },
  { method: "GET", path: "/api/pricing", category: "System", desc: "Plans and limits.", params: [] },
  { method: "GET", path: "/api/notifications", category: "System", desc: "Recent server notifications.", params: [] },
  { method: "GET", path: "/api/stream", category: "Realtime", live: true, desc: "Server-sent events with live metrics and notifications.", params: [] },

  { method: "GET", path: "/api/time", category: "Utility", desc: "Current time in any IANA time zone.", params: [{ name: "tz", example: "Asia/Jakarta", note: "IANA name" }] },
  { method: "GET", path: "/api/ip", category: "Utility", desc: "Your IP address and edge location.", params: [] },
  { method: "GET", path: "/api/uuid", category: "Utility", desc: "Random UUID v4 values.", params: [{ name: "count", example: "3", note: "1 to 20" }] },
  { method: "GET", path: "/api/random", category: "Utility", desc: "Cryptographically random integer in a range.", params: [{ name: "min", example: "1" }, { name: "max", example: "100" }] },
  { method: "GET", path: "/api/hash", category: "Utility", desc: "SHA hash of a text.", params: [{ name: "text", example: "heyyarya" }, { name: "algo", example: "sha256", note: "sha1, sha256, sha384, sha512" }] },
  { method: "GET", path: "/api/base64", category: "Utility", desc: "Encode or decode Base64 (UTF-8 safe).", params: [{ name: "text", example: "hello world" }, { name: "mode", example: "encode", note: "encode or decode" }] },
  { method: "POST", path: "/api/echo", category: "Utility", desc: "Returns what you sent: body, content type and edge.", params: [], body: "{\"hello\":\"heyyarya\"}" },

  { method: "GET", path: "/api/scrape/meta", category: "Scraper", desc: "Title, description, canonical URL and image of a page.", params: [{ name: "url", example: "https://example.com" }] },
  { method: "GET", path: "/api/scrape/links", category: "Scraper", desc: "All links on a page as absolute URLs.", params: [{ name: "url", example: "https://example.com" }] },
];

// Harga contoh. Ubah sesuai kebutuhan.
export const PLANS = [
  {
    id: "free", name: "Free", price: 0, period: "month", cta: "Start free",
    tagline: "For side projects and testing.",
    features: ["100,000 requests per month", "All utility endpoints", "2 scraper runs per minute", "Community support"],
  },
  {
    id: "pro", name: "Pro", price: 19, period: "month", cta: "Go Pro", featured: true,
    tagline: "For apps in production.",
    features: ["5,000,000 requests per month", "All endpoints and scrapers", "60 scraper runs per minute", "Real-time stream access", "Email support"],
  },
  {
    id: "scale", name: "Scale", price: 79, period: "month", cta: "Talk to us",
    tagline: "For teams with heavy traffic.",
    features: ["50,000,000 requests per month", "Dedicated rate limits", "Custom endpoints", "99.9% uptime target", "Priority support"],
  },
];
