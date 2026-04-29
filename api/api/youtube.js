// api/youtube.js — Vercel serverless function
// Queries YouTube Data API v3 for performer + piece recordings
// Env var required: YOUTUBE_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { q, pieceHint } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query too short", results: [] });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "YouTube API key not configured" });

  // Build search query: performer + piece
  const searchQuery = `${q.trim()} ${pieceHint || "piano"}`;

  try {
    const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    ytUrl.searchParams.set("part", "snippet");
    ytUrl.searchParams.set("q", searchQuery);
    ytUrl.searchParams.set("type", "video");
    ytUrl.searchParams.set("videoCategoryId", "10"); // Music category
    ytUrl.searchParams.set("maxResults", "8");
    ytUrl.searchParams.set("relevanceLanguage", "en");
    ytUrl.searchParams.set("key", apiKey);

    const ytRes = await fetch(ytUrl.toString());
    if (!ytRes.ok) {
      const err = await ytRes.json();
      return res.status(502).json({ error: "YouTube API error", details: err });
    }

    const data = await ytRes.json();
    if (!data.items || !data.items.length) {
      return res.status(200).json({ results: [] });
    }

    // Filter and score results for piano performance relevance
    const EXCLUDE_WORDS = [
      "lecture", "tutorial", "lesson", "theory", "analysis", "how to",
      "harmony", "sheet music", "score", "midi", "karaoke", "accompaniment",
      "backing track", "cover by", "beginner", "easy version", "simplified"
    ];
    const PERFORMANCE_WORDS = [
      "live", "concert", "recital", "performance", "plays", "performing",
      "piano", "pianist", "competition", "masterclass", "recording"
    ];

    const results = data.items
      .map(function(item) {
        const title = item.snippet.title || "";
        const channel = item.snippet.channelTitle || "";
        const titleLower = title.toLowerCase();
        const channelLower = channel.toLowerCase();

        // Skip if clearly not a performance
        const isExcluded = EXCLUDE_WORDS.some(w => titleLower.includes(w));
        if (isExcluded) return null;

        // Score relevance
        let score = 0;
        PERFORMANCE_WORDS.forEach(w => { if (titleLower.includes(w)) score++; });
        if (channelLower.includes("piano") || channelLower.includes("music")) score++;

        // Extract a clean performer name from title
        // Strategy: query string is the performer — use it, fall back to channel name
        const performerName = extractPerformerName(q.trim(), title, channel);

        return {
          videoId: item.id.videoId,
          videoTitle: title,
          performerName: performerName,
          channelName: channel,
          thumbnail: item.snippet.thumbnails?.default?.url || "",
          score: score
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Return top 5

    return res.status(200).json({ results });
  } catch (err) {
    console.error("YouTube search error:", err);
    return res.status(500).json({ error: err.message, results: [] });
  }
}

/**
 * Try to extract a clean performer name from the video title.
 * Strategy: title often starts with "Pianist Name - Piece" or "Piece - Pianist Name"
 */
function extractPerformerName(query, title, channel) {
  // Normalize query: capitalise each word
  const queryClean = query.trim().split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  // If query appears verbatim (case-insensitive) in title, use it
  if (title.toLowerCase().includes(query.toLowerCase())) {
    return queryClean;
  }

  // Try to find a name pattern before or after common separators
  const separators = [" - ", " | ", ": ", " — ", " – "];
  for (const sep of separators) {
    const parts = title.split(sep);
    if (parts.length >= 2) {
      // Check if first part looks like a name (short, capitalised words)
      const first = parts[0].trim();
      if (first.length < 40 && /^[A-Z]/.test(first) && !first.includes("Chopin")) {
        return first;
      }
      // Check last part
      const last = parts[parts.length - 1].trim();
      if (last.length < 40 && /^[A-Z]/.test(last) && !last.includes("Chopin")) {
        return last;
      }
    }
  }

  // Fall back to cleaned query or channel name
  return queryClean || channel;
}
