// api/vision.js — Claude Sonnet with vision support
// Place at api/vision.js in your GitHub repo

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages required" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",  // Sonnet supports vision
        max_tokens: 1500,
        system: system || "",
        messages: messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic vision API error:", err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("vision handler error:", err);
    return res.status(500).json({ error: err.message });
  }
};
