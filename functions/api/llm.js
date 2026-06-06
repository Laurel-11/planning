import { json, missing } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.LLM_API_KEY) return missing("LLM_API_KEY");

  const body = await request.json().catch(() => ({}));
  const base = (env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const payload = {
    model: env.LLM_MODEL || "deepseek-chat",
    max_tokens: body.max_tokens || 2048,
    messages: [
      { role: "system", content: body.systemPrompt || "" },
      { role: "user", content: body.userContent || "" },
    ],
  };
  if (body.jsonMode) payload.response_format = { type: "json_object" };

  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LLM_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ error: data.error?.message || upstream.statusText }, upstream.status);

  return json({ content: data.choices?.[0]?.message?.content || "" });
}
