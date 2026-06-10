// /api/entries.js — proxies all entry operations through Vercel to Supabase // Browser calls /api/entries (same domain) — no CORS, no URL rewriting issues

const SUPABASE_URL = "https://lvfksmbtghilwwdpjoxh.supabase.co"; const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2ZmtzbWJ0Z2hpbHd3ZHBqb3hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTk0MTAsImV4cCI6MjA5NjY3NTQxMH0.wwsOx9TNCWW3efrec-oGNd8DWC7BtHHhYEuljEGHiGM";

const SB_HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=minimal",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // GET — load all entries
    if (req.method === "GET") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/entries?select=*&order=submitted_at.asc`, {
        headers: SB_HEADERS,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));
      return res.status(200).json(data);
    }

    // POST — save a new entry
    if (req.method === "POST") {
      const body = req.body;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/entries`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.text();
        throw new Error(err);
      }
      return res.status(201).json({ success: true });
    }

    // DELETE — remove entry by id or all entries
    if (req.method === "DELETE") {
      const { id, all } = req.query;
      const filter = all ? "id=gte.0" : `id=eq.${id}`;
      const r = await fetch(`${SUPABASE_URL}/rest/v1/entries?${filter}`, {
        method: "DELETE",
        headers: SB_HEADERS,
      });
      if (!r.ok) throw new Error(await r.text());
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (error) {
    console.error("entries API error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}



