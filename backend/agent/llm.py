"""LLM 客户端：混合模式的开关。

- 未配置 API Key：llm_enabled=False，调用方走规则/模板兜底，保证零依赖可跑。
- 配置 API Key：调用真实大模型做意图理解与文案润色。

对外暴露统一的 complete_json / complete_text 接口，调用方无需关心后端。
"""
from __future__ import annotations

import json

from ..config import settings


class LLMClient:
    def __init__(self) -> None:
        self.enabled = settings.llm_enabled

    async def complete_json(self, system: str, user: str) -> dict | None:
        """请模型返回 JSON。未启用或失败时返回 None，由调用方兜底。"""
        if not self.enabled:
            return None
        try:
            text = await self._call(system, user)
            # 容错：截取首个 { 到末个 } 之间的内容
            start, end = text.find("{"), text.rfind("}")
            if start == -1 or end == -1:
                return None
            return json.loads(text[start:end + 1])
        except Exception:
            return None

    async def complete_text(self, system: str, user: str) -> str | None:
        """请模型返回自由文本（用于文案润色）。失败返回 None。"""
        if not self.enabled:
            return None
        try:
            return await self._call(system, user)
        except Exception:
            return None

    async def _call(self, system: str, user: str) -> str:
        """调用 OpenAI 兼容格式 API（DeepSeek / OpenAI 均可）。"""
        import httpx

        headers = {
            "Authorization": f"Bearer {settings.LLM_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": settings.LLM_MODEL,
            "max_tokens": 1024,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.LLM_BASE_URL}/chat/completions",
                headers=headers, json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]


llm = LLMClient()
