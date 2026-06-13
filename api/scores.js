// /api/scores.js — Vercel serverless function
// Fetches the live US Open leaderboard from ESPN's public golf API
// and returns it in the sweep app's { name: toParScore } format.
// Called every ~2 minutes by the sweep app during the tournament.

// 2026 US Open event ID (verify on ESPN before the tournament — see note below).
// If this ID is wrong or returns no players, we automatically fall back to
// whatever PGA event ESPN currently lists, which during US Open week is the US Open.
const US_OPEN_EVENT_ID = "401353338";

const ESPN_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga";

async function fetchLeaderboard(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`ESPN API returned ${response.status}`);
  return response.json();
}

// Pull the competitor list out of ESPN's nested response, if present.
function getCompetition(data) {
  const event = data && data.events && data.events[0];
  if (!event || !event.competitions || !event.competitions[0]) return null;
  return { event, competition: event.competitions[0] };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");

  try {
    // 1) Try the specific event ID first.
    let data = await fetchLeaderboard(`${ESPN_BASE}&event=${US_OPEN_EVENT_ID}`);
    let parsed = getCompetition(data);
    let usedFallback = false;

    // 2) If that gave us nothing usable, fall back to the current PGA event.
    if (!parsed || !(parsed.competition.competitors || []).length) {
      data = await fetchLeaderboard(ESPN_BASE);
      parsed = getCompetition(data);
      usedFallback = true;
    }

    if (!parsed) {
      return res.status(200).json({
        scores: {},
        source: "pending",
        round: null,
        message: "ESPN leaderboard not available yet",
      });
    }

    const { event, competition } = parsed;
    const competitors = competition.competitors || [];

    const scores = {};
    const cut = [];        // names who missed the cut
    const withdrawn = [];  // names who WD / DQ
    let round = null;

    const statusObj = event.status || competition.status;
    if (statusObj && statusObj.period) round = statusObj.period;

    competitors.forEach((player) => {
      const name = player.athlete && player.athlete.displayName;
      if (!name) return;

      // Player status: ESPN exposes this on player.status.type
      const st = player.status || {};
      const stType = (st.type && (st.type.name || st.type.id)) || "";
      const stState = (st.type && st.type.state) || "";
      const isCut =
        /cut/i.test(String(stType)) || /cut/i.test(String(st.displayValue || ""));
      const isWD =
        /(wd|withdraw|dq|disqualif)/i.test(String(stType)) ||
        /(wd|withdraw|dq|disqualif)/i.test(String(st.displayValue || ""));

      // To-par score. ESPN uses "E" for even, "+5"/"-3" etc.
      const scoreStr = player.score && player.score.displayValue;
      let score = 0;
      if (scoreStr !== undefined && scoreStr !== null) {
        const s = String(scoreStr).trim();
        if (s === "E" || s === "0") {
          score = 0;
        } else {
          const parsed2 = parseInt(s.replace("+", ""), 10);
          score = isNaN(parsed2) ? 0 : parsed2;
        }
      }

      scores[name] = score;
      if (isCut) cut.push(name);
      if (isWD) withdrawn.push(name);
    });

    if (Object.keys(scores).length === 0) {
      return res.status(200).json({
        scores: {},
        source: "pending",
        round: null,
        message: "Tournament not yet started or ESPN data unavailable",
      });
    }

    return res.status(200).json({
      scores,
      cut,
      withdrawn,
      round,
      source: "live",
      usedFallback, // true if we matched via current-event fallback rather than the hardcoded ID
    });
  } catch (error) {
    // Return empty so the app falls back to mock scores gracefully.
    return res.status(200).json({
      scores: {},
      source: "error",
      round: null,
      error: error.message,
    });
  }
}
