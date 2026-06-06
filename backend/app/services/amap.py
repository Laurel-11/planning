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


def _normalize_poi(poi: dict[str, Any]) -> dict[str, Any]:
    location = poi.get("location", "")
    lng = lat = None
    if "," in location:
        raw_lng, raw_lat = location.split(",", 1)
        try:
            lng, lat = float(raw_lng), float(raw_lat)
        except ValueError:
            pass
    biz_ext = poi.get("biz_ext") or {}
    try:
        rating = float(biz_ext.get("rating") or 4.5)
    except (TypeError, ValueError):
        rating = 4.5
    try:
        cost = int(float(biz_ext.get("cost") or 0))
    except (TypeError, ValueError):
        cost = 0
    return {
        "id": poi.get("id"),
        "name": poi.get("name"),
        "type": poi.get("type"),
        "address": poi.get("address"),
        "lng": lng,
        "lat": lat,
        "rating": rating,
        "cost": cost,
    }


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


async def bicycling(origin: dict[str, float], destination: dict[str, float]) -> dict[str, Any] | None:
    """Plan a bicycling route. Returns None if AMap has no usable route."""
    key = _require_key()
    params = {
        "key": key,
        "origin": _format_coord(origin),
        "destination": _format_coord(destination),
    }
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v4/direction/bicycling",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if str(data.get("errcode", "0")) not in {"0", "10000"} and data.get("status") not in {"1", 1}:
        return None

    paths = (data.get("data") or {}).get("paths") or data.get("paths") or []
    if not paths:
        return None
    path = paths[0]
    return {
        "distance": int(float(path.get("distance") or 0)),
        "duration": int(float(path.get("duration") or 0)),
    }


async def transit(origin: dict[str, float], destination: dict[str, float], city: str = "北京") -> dict[str, Any] | None:
    """Find the shortest public transit scheme. Includes bus and metro details."""
    key = _require_key()
    params = {
        "key": key,
        "origin": _format_coord(origin),
        "destination": _format_coord(destination),
        "city": city,
        "cityd": city,
        "strategy": 0,
        "extensions": "base",
    }
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/direction/transit/integrated",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        return None

    transits = data.get("route", {}).get("transits", [])
    best: dict[str, Any] | None = None
    best_duration = 0
    for item in transits:
        try:
            duration = int(float(item.get("duration") or 0))
        except (TypeError, ValueError):
            duration = 0
        if duration <= 0:
            continue
        if best is None or duration < best_duration:
            best = item
            best_duration = duration
    if best is None:
        return None
    return {
        "duration": best_duration,
        "segments": _parse_transit_segments(best),
    }


def _parse_transit_segments(transit_scheme: dict[str, Any]) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    for segment in transit_scheme.get("segments") or []:
        walking = segment.get("walking") or {}
        try:
            walk_distance = int(float(walking.get("distance") or 0))
        except (TypeError, ValueError):
            walk_distance = 0
        if walk_distance > 0:
            try:
                walk_duration = int(float(walking.get("duration") or 0))
            except (TypeError, ValueError):
                walk_duration = 0
            segments.append({
                "type": "walking",
                "distance": walk_distance,
                "duration": walk_duration,
                "instruction": "步行",
            })

        bus = segment.get("bus") or {}
        for line in bus.get("buslines") or []:
            departure = line.get("departure_stop") or {}
            arrival = line.get("arrival_stop") or {}
            try:
                duration = int(float(line.get("duration") or 0))
            except (TypeError, ValueError):
                duration = 0
            try:
                via_num = int(float(line.get("via_num") or 0))
            except (TypeError, ValueError):
                via_num = 0
            name = line.get("name") or "公共交通"
            vehicle_type = "metro" if ("地铁" in name or "轨道" in name) else "bus"
            segments.append({
                "type": vehicle_type,
                "name": name,
                "departure_stop": departure.get("name") or "",
                "arrival_stop": arrival.get("name") or "",
                "via_num": via_num,
                "duration": duration,
            })
    return segments


async def place_text_search(
    keywords: str,
    city: str = "北京",
    page: int = 1,
    offset: int = 10,
    types: str = "",
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
    if types:
        params["types"] = types
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/place/text",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        raise AMapError(data.get("info") or "AMap place search failed")

    pois = [_normalize_poi(poi) for poi in data.get("pois", [])]
    return {"count": int(data.get("count") or 0), "pois": pois}


async def place_around(
    location: str,
    keywords: str = "",
    types: str = "",
    radius: int = 3000,
    offset: int = 12,
) -> dict[str, Any]:
    """Search POIs around a coordinate using AMap Web Service."""
    key = _require_key()
    params = {
        "key": key,
        "location": location,
        "radius": radius,
        "offset": offset,
        "extensions": "all",
    }
    if keywords:
        params["keywords"] = keywords
    if types:
        params["types"] = types
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/place/around",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        raise AMapError(data.get("info") or "AMap around search failed")

    pois = [_normalize_poi(poi) for poi in data.get("pois", [])]
    return {"count": int(data.get("count") or 0), "pois": pois}


async def regeo(location: str) -> dict[str, Any]:
    """Reverse geocode a coordinate using AMap Web Service."""
    key = _require_key()
    params = {"key": key, "location": location, "extensions": "base"}
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/geocode/regeo",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        raise AMapError(data.get("info") or "AMap reverse geocoding failed")

    regeocode = data.get("regeocode") or {}
    return {
        "formatted_address": regeocode.get("formatted_address", ""),
        "addressComponent": regeocode.get("addressComponent") or {},
    }


async def weather(city: str) -> dict[str, Any]:
    """Fetch live weather using AMap Web Service."""
    key = _require_key()
    params = {"key": key, "city": city, "output": "json"}
    async with httpx.AsyncClient(timeout=12) as client:
        resp = await client.get(
            f"{settings.AMAP_WEB_SERVICE_BASE_URL}/v3/weather/weatherInfo",
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "1":
        raise AMapError(data.get("info") or "AMap weather failed")

    return {"lives": data.get("lives") or []}
