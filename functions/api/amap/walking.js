import { amapFetch, json, parsePolyline } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const points = Array.isArray(body.points) ? body.points : [];
  const city = body.city || "北京";
  if (points.length < 2) return json({ error: "At least two points are required" }, 400);

  const legs = [];
  let distance = 0;
  let duration = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const { response, data } = await amapFetch(env, "/v3/direction/walking", {
      origin: `${start.lng},${start.lat}`,
      destination: `${end.lng},${end.lat}`,
      extensions: "base",
    });
    if (response) return response;

    const path = data.route?.paths?.[0];
    if (!path) return json({ error: "AMap walking route returned no path" }, 503);
    const legDistance = Number.parseInt(path.distance, 10) || 0;
    const legDuration = Number.parseInt(path.duration, 10) || 0;
    const polyline = (path.steps || []).flatMap((step) => parsePolyline(step.polyline));
    const bikeDuration = await fetchBicyclingDuration(env, start, end);
    const transit = await fetchTransit(env, start, end, city);
    distance += legDistance;
    duration += legDuration;
    const leg = {
      origin: start,
      destination: end,
      distance: legDistance,
      duration: legDuration,
      polyline,
    };
    if (bikeDuration) leg.bicycling_duration = bikeDuration;
    if (transit) {
      leg.transit_duration = transit.duration;
      leg.transit_segments = transit.segments;
    }
    legs.push(leg);
  }

  return json({
    ok: true,
    provider: "amap_web_service",
    distance,
    duration,
    legs,
  });
}

async function fetchBicyclingDuration(env, start, end) {
  const { response, data } = await amapFetch(env, "/v4/direction/bicycling", {
    origin: `${start.lng},${start.lat}`,
    destination: `${end.lng},${end.lat}`,
  });
  if (response) return null;
  const path = data.data?.paths?.[0] || data.paths?.[0];
  return Number.parseInt(path?.duration, 10) || null;
}

async function fetchTransit(env, start, end, city) {
  const { response, data } = await amapFetch(env, "/v3/direction/transit/integrated", {
    origin: `${start.lng},${start.lat}`,
    destination: `${end.lng},${end.lat}`,
    city,
    cityd: city,
    strategy: "0",
    extensions: "base",
  });
  if (response) return null;
  const schemes = (data.route?.transits || [])
    .map((item) => ({ item, duration: Number.parseInt(item.duration, 10) || 0 }))
    .filter((entry) => entry.duration > 0)
    .sort((a, b) => a.duration - b.duration);
  if (!schemes.length) return null;
  const best = schemes[0];
  return {
    duration: best.duration,
    segments: parseTransitSegments(best.item),
  };
}

function parseTransitSegments(scheme) {
  const segments = [];
  for (const segment of scheme.segments || []) {
    const walking = segment.walking || {};
    const walkDistance = Number.parseInt(walking.distance, 10) || 0;
    if (walkDistance > 0) {
      segments.push({
        type: "walking",
        distance: walkDistance,
        duration: Number.parseInt(walking.duration, 10) || 0,
        instruction: "步行",
      });
    }

    const bus = segment.bus || {};
    for (const line of bus.buslines || []) {
      const name = line.name || "公共交通";
      segments.push({
        type: name.includes("地铁") || name.includes("轨道") ? "metro" : "bus",
        name,
        departure_stop: line.departure_stop?.name || "",
        arrival_stop: line.arrival_stop?.name || "",
        via_num: Number.parseInt(line.via_num, 10) || 0,
        duration: Number.parseInt(line.duration, 10) || 0,
      });
    }
  }
  return segments;
}
