export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { prompt, imageBase64, mediaType } = req.body;
  const messages = imageBase64
    ? [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: prompt }
      ]}]
    : [{ role: "user", content: prompt }];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1000, messages }),
  });
  const data = await resp.json();
  const text = data.content?.map(b => b.text || "").join("") || "";
  res.status(200).json({ text });
}