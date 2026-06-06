import { json, missing } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!env.LLM_API_KEY) return missing("LLM_API_KEY");
  const body = await request.json().catch(() => ({}));
  const base = (env.LLM_BASE_URL || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const payload = {
    model: env.LLM_MODEL || "deepseek-chat",
    max_tokens: 600,
    messages: [
      {
        role: "system",
        content: "你是「Leisure Done」本地生活助手 Leo。回答简洁、有用，控制在150字以内。如果提到产品名，只使用 Leisure Done，不要说“闲时达”。",
      },
      {
        role: "user",
        content: `${body.message || ""}${body.context ? `\n当前方案摘要：${body.context}` : ""}`,
      },
    ],
  };
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.LLM_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) return json({ detail: data.error?.message || upstream.statusText }, upstream.status);
  return json({ reply: data.choices?.[0]?.message?.content || "Leo 暂时没有想到合适回答。" });
}

