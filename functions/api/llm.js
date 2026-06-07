import { json, missing } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.LLM_API_KEY) return missing("LLM_API_KEY");

  const body = await request.json().catch(() => ({}));
  const base = (env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const requestedTokens = Number(body.max_tokens || (body.jsonMode ? 768 : 320));
  const maxTokens = Math.max(64, Math.min(requestedTokens, body.jsonMode ? 700 : 320));
  const systemPrompt = body.jsonMode
    ? `${body.systemPrompt || ""}\n\n只输出 minified JSON。不要 markdown，不要解释，不要推理过程，不要自检。`
    : `${body.systemPrompt || ""}\n\n直接给最终答复，80字以内，不要推理过程。`;
  const payload = {
    model: env.LLM_MODEL || "deepseek-v4-flash",
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
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
