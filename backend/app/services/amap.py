"""AMap Web Service API client.

This module is intentionally server-side. The Web Service key should live in
.env and should not be exposed to the browser.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..config import settings


class AMapError(RuntimeError):
    pass


def _require_key() -> str:
    if not settings.AMAP_WEB_SERVICE_KEY:
        raise AMapError("AMAP_WEB_SERVICE_KEY is not configured")
    return settings.AMAP_WEB_SERVICE_KEY


def _format_coord(point: dict[str, float]) -> str:
    return f"{point['lng']},{point['lat']}"


def _parse_polyline(polyline: str) -> list[dict[str, float]]:
    points: list[dict[str, float]] = []
    for item in (polyline or "").split(";"):
        if not item or "," not in item:
            continue
        lng, lat = item.split(",", 1)
        try:
            points.append({"lng": float(lng), "lat": float(lat)})
        except ValueError:
            continue
    return points


async def walking(origin: dict[str, float], destination: dict[str, float]) -> dict[str, Any]:
    """Plan a walking route between two coordinates using AMap Web Service."""
    key = _require_key()
    params = {
        "key": key,
        "origin": _format_coord(origin),
        "destination": _format_coord(destination),
        "extensions": "base",
    }
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/direction/walking",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        raise AMapError(data.get("info") or "AMap walking route failed")

    paths = data.get("route", {}).get("paths", [])
    if not paths:
        raise AMapError("AMap walking route returned no path")

    path = paths[0]
    steps = path.get("steps", [])
    polyline: list[dict[str, float]] = []
    for step in steps:
        polyline.extend(_parse_polyline(step.get("polyline", "")))

    return {
        "distance": int(float(path.get("distance") or 0)),
        "duration": int(float(path.get("duration") or 0)),
        "polyline": polyline,
    }


async def place_text_search(
    keywords: str,
    city: str = "北京",
    page: int = 1,
    offset: int = 10,
) -> dict[str, Any]:
    """Search POIs using AMap Web Service text search."""
    key = _require_key()
    params = {
        "key": key,
        "keywords": keywords,
        "city": city,
        "page": page,
        "offset": offset,
        "extensions": "base",
    }
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/place/text",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        raise AMapError(data.get("info") or "AMap place search failed")

    pois = []
    for poi in data.get("pois", []):
        location = poi.get("location", "")
        lng = lat = None
        if "," in location:
            raw_lng, raw_lat = location.split(",", 1)
            try:
                lng, lat = float(raw_lng), float(raw_lat)
            except ValueError:
                pass
        pois.append({
            "id": poi.get("id"),
            "name": poi.get("name"),
            "type": poi.get("type"),
            "address": poi.get("address"),
            "lng": lng,
            "lat": lat,
        })
    return {"count": int(data.get("count") or 0), "pois": pois}
