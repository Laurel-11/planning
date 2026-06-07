"""FastAPI 入口与路由层。

接口：
- POST /api/plan      : 自然语言 → 意图解析 + 多套方案
- POST /api/relay     : 方案 + 受众 → 接力视角卡
- POST /api/execute   : 确认方案 → 并行执行 + 行程卡
- POST /api/chat      : 自由追问（DeepSeek 直接回答）
- GET  /api/discover  : 发现页热门推荐数据
- GET  /api/health    : 状态检查
- GET  /              : 前端单页
"""
from __future__ import annotations

import os
import uuid

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .agent import orchestrator
from .agent.llm import llm
from .auth import (
    AuthError,
    create_trip,
    delete_session,
    get_user_by_token,
    init_db,
    list_trips,
    login_user,
    register_user,
)
from .data.mock_db import DISCOVER_SPOTS, USER_HOME
from .models.schemas import Audience, Plan, Scene, UserRequest
from .services import amap

app = FastAPI(title="今日拍板 · 本地探索Agent")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_SESSIONS: dict[str, object] = {}

_FRONTEND_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "frontend")

_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


# ============ 请求体 ============

class RelayBody(BaseModel):
    plan: Plan
    audience: Audience
    scene: Scene = Scene.FAMILY


class ExecuteBody(BaseModel):
    session_id: str
    plan: Plan
    extras: list[str] = []


class Coordinate(BaseModel):
    lat: float
    lng: float
    name: str = ""


class WalkingBody(BaseModel):
    points: list[Coordinate]
    city: str = "北京"


class ChatBody(BaseModel):
    message: str
    context: str = ""   # 可选：当前方案摘要，给 LLM 上下文


class LLMBody(BaseModel):
    systemPrompt: str
    userContent: str
    jsonMode: bool = False
    max_tokens: int = 768


class AuthBody(BaseModel):
    username: str
    password: str


class TripBody(BaseModel):
    title: str
    summary: str = ""
    steps: list[str] = []
    plan: dict = {}


@app.on_event("startup")
async def startup() -> None:
    init_db()


# ============ 接口 ============

def _auth_response(user: dict, token: str) -> dict:
    return {"ok": True, "user": user, "token": token}


def _bearer_token(authorization: str = "") -> str:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return ""
    return token.strip()


def _current_user(authorization: str = "") -> dict:
    user = get_user_by_token(_bearer_token(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="请先登录")
    return user


@app.post("/api/auth/register")
async def api_auth_register(body: AuthBody):
    try:
        user, token = register_user(body.username, body.password)
    except AuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _auth_response(user, token)


@app.post("/api/auth/login")
async def api_auth_login(body: AuthBody):
    try:
        user, token = login_user(body.username, body.password)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return _auth_response(user, token)


@app.get("/api/auth/me")
async def api_auth_me(authorization: str = Header("")):
    token = _bearer_token(authorization)
    user = get_user_by_token(token)
    if not user:
        return {"ok": False, "user": None}
    return {"ok": True, "user": user}


@app.post("/api/auth/logout")
async def api_auth_logout(authorization: str = Header("")):
    delete_session(_bearer_token(authorization))
    return {"ok": True}


@app.get("/api/history")
async def api_history_list(authorization: str = Header("")):
    user = _current_user(authorization)
    return {"ok": True, "items": list_trips(int(user["id"]))}


@app.post("/api/history")
async def api_history_create(body: TripBody, authorization: str = Header("")):
    user = _current_user(authorization)
    trip = create_trip(
        int(user["id"]),
        body.title,
        body.summary,
        body.steps,
        body.plan,
    )
    return {"ok": True, "item": trip}


@app.post("/api/plan")
async def api_plan(req: UserRequest):
    resp, parsed = await orchestrator.plan(req)
    session_id = uuid.uuid4().hex[:12]
    _SESSIONS[session_id] = parsed
    return {"session_id": session_id, **resp.model_dump()}


@app.post("/api/relay")
async def api_relay(body: RelayBody):
    card = orchestrator.relay_card(body.plan, body.audience, body.scene)
    return card.model_dump()


@app.post("/api/execute")
async def api_execute(body: ExecuteBody):
    parsed = _SESSIONS.get(body.session_id)
    if parsed is None:
        from .models.schemas import ParsedIntent
        parsed = ParsedIntent(scene=Scene.FAMILY, party_size=3)
    result = await orchestrator.execute(body.plan, parsed, body.extras)
    return result.model_dump()


@app.post("/api/chat")
async def api_chat(body: ChatBody):
    """自由追问接口：用 DeepSeek 直接回答关于活动/餐厅/路线的问题。"""
    system = (
        "你是「Leisure Done」本地生活助手 Leo。"
        "直接回答，控制在80字以内，不要推理过程。"
        "如果提到产品名，只使用 Leisure Done，不要说“闲时达”。"
        "如果用户问路线，给出步行/骑行建议和大概时间，不要说'打开地图'，"
        "因为页面上有内置地图。如果上下文中有方案信息，结合方案回答。"
    )
    ctx = f"\n当前方案摘要：{body.context}" if body.context else ""
    reply = await llm.complete_text(system, body.message + ctx)
    if reply is None:
        # LLM 不可用时的兜底
        reply = "好问题！附近半径3公里内步行/骑行都很方便，可以结合当前方案的地图页查看路线 🗺️"
    return {"reply": reply}


@app.post("/api/llm")
async def api_llm(body: LLMBody):
    """OpenAI-compatible LLM proxy. Keeps API keys server-side."""
    from .config import settings
    if not settings.LLM_API_KEY:
        raise HTTPException(status_code=501, detail="LLM_API_KEY is not configured")

    import httpx
    max_tokens = max(64, min(body.max_tokens, 700 if body.jsonMode else 320))
    system_prompt = body.systemPrompt
    if body.jsonMode:
        system_prompt = (
            f"{system_prompt}\n\n"
            "只输出 minified JSON。不要 markdown，不要解释，不要推理过程，不要自检。"
        )
    else:
        system_prompt = (
            f"{system_prompt}\n\n"
            "直接给最终答复，80字以内，不要推理过程。"
        )
    payload = {
        "model": settings.LLM_MODEL,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": body.userContent},
        ],
    }
    if body.jsonMode:
        payload["response_format"] = {"type": "json_object"}

    async with httpx.AsyncClient(timeout=40) as client:
        resp = await client.post(
            f"{settings.LLM_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.LLM_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json()

    return {"content": data["choices"][0]["message"]["content"]}


@app.get("/api/discover")
async def api_discover():
    """发现页：热门场所 + 用户出发点坐标。"""
    return {"spots": DISCOVER_SPOTS, "home": USER_HOME}


@app.post("/api/amap/walking")
async def api_amap_walking(body: WalkingBody):
    """Server-side AMap walking route planning for one or more route legs."""
    if len(body.points) < 2:
        raise HTTPException(status_code=400, detail="At least two points are required")

    legs = []
    total_distance = 0
    total_duration = 0
    try:
        for start, end in zip(body.points, body.points[1:]):
            start_point = start.model_dump()
            end_point = end.model_dump()
            leg = await amap.walking(start_point, end_point)
            try:
                bike = await amap.bicycling(start_point, end_point)
            except Exception:
                bike = None
            try:
                transit = await amap.transit(start_point, end_point, body.city)
            except Exception:
                transit = None
            if bike:
                leg["bicycling_duration"] = bike["duration"]
            if transit:
                leg["transit_duration"] = transit["duration"]
                leg["transit_segments"] = transit.get("segments", [])
            legs.append({
                "origin": start_point,
                "destination": end_point,
                **leg,
            })
            total_distance += leg["distance"]
            total_duration += leg["duration"]
    except amap.AMapError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "ok": True,
        "provider": "amap_web_service",
        "distance": total_distance,
        "duration": total_duration,
        "legs": legs,
    }


@app.get("/api/amap/place-search")
async def api_amap_place_search(
    keywords: str = Query(..., min_length=1),
    city: str = "北京",
    types: str = "",
    page: int = Query(1, ge=1),
    offset: int = Query(10, ge=1, le=25),
):
    """Server-side AMap POI text search."""
    try:
        return await amap.place_text_search(keywords, city=city, page=page, offset=offset, types=types)
    except amap.AMapError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/amap/around")
async def api_amap_around(
    location: str = Query(..., min_length=3),
    keywords: str = "",
    types: str = "",
    radius: int = Query(3000, ge=100, le=10000),
    offset: int = Query(12, ge=1, le=25),
):
    """Server-side AMap nearby POI search."""
    try:
        return await amap.place_around(
            location=location, keywords=keywords, types=types, radius=radius, offset=offset
        )
    except amap.AMapError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/amap/regeo")
async def api_amap_regeo(lng: float, lat: float):
    """Server-side AMap reverse geocoding."""
    try:
        return await amap.regeo(f"{lng},{lat}")
    except amap.AMapError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/amap/weather")
async def api_amap_weather(city: str = "北京"):
    """Server-side AMap live weather."""
    try:
        return await amap.weather(city)
    except amap.AMapError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/health")
async def health():
    from .config import settings
    return {"status": "ok", "llm_enabled": settings.llm_enabled,
            "model": settings.LLM_MODEL,
            "amap_web_service_enabled": settings.amap_web_service_enabled,
            "amap_js_api_enabled": settings.amap_js_api_enabled}


# ============ 前端托管 ============

if os.path.isdir(_FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=_FRONTEND_DIR), name="static")
    assets_dir = os.path.join(_FRONTEND_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    async def index():
        return FileResponse(os.path.join(_FRONTEND_DIR, "index.html"), headers=_NO_CACHE_HEADERS)

    @app.get("/styles.css")
    async def styles():
        return FileResponse(os.path.join(_FRONTEND_DIR, "styles.css"), headers=_NO_CACHE_HEADERS)

    @app.get("/app.js")
    async def script():
        return FileResponse(os.path.join(_FRONTEND_DIR, "app.js"), headers=_NO_CACHE_HEADERS)

    @app.get("/config.js")
    async def frontend_config():
        from .config import settings
        return Response(
            "window.APP_CONFIG = "
            f"{{ API_BASE_URL: {settings.API_BASE_URL!r}, "
            f"AMAP_JS_API_KEY: {settings.AMAP_JS_API_KEY!r}, "
            f"AMAP_KEY: {settings.AMAP_JS_API_KEY!r}, "
            f"AMAP_SECURITY_JS_CODE: {settings.AMAP_SECURITY_JS_CODE!r} }};",
            media_type="application/javascript",
            headers=_NO_CACHE_HEADERS,
        )
