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
    const transitDuration = await fetchTransitDuration(env, start, end, city);
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
    if (transitDuration) leg.transit_duration = transitDuration;
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

async function fetchTransitDuration(env, start, end, city) {
  const { response, data } = await amapFetch(env, "/v3/direction/transit/integrated", {
    origin: `${start.lng},${start.lat}`,
    destination: `${end.lng},${end.lat}`,
    city,
    cityd: city,
    strategy: "0",
    extensions: "base",
  });
  if (response) return null;
  const durations = (data.route?.transits || [])
    .map((item) => Number.parseInt(item.duration, 10) || 0)
    .filter((duration) => duration > 0);
  return durations.length ? Math.min(...durations) : null;
}
