export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function missing(name) {
  return json({ error: `${name} is not configured` }, 501);
}

export function amapKey(env) {
  return env.AMAP_WEB_SERVICE_KEY || "";
}

export function amapBase(env) {
  return (env.AMAP_WEB_SERVICE_BASE_URL || "https://restapi.amap.com").replace(/\/+$/, "");
}

export async function amapFetch(env, path, params) {
  const key = amapKey(env);
  if (!key) return { response: missing("AMAP_WEB_SERVICE_KEY"), data: null };
  const url = new URL(`${amapBase(env)}${path}`);
  url.searchParams.set("key", key);
  Object.entries(params || {}).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  });
  const upstream = await fetch(url);
  const data = await upstream.json();
  if (data.status && data.status !== "1") {
    return { response: json({ error: data.info || "AMap request failed" }, 503), data: null };
  }
  return { response: null, data };
}

export function normalizePoi(poi) {
  const [rawLng, rawLat] = String(poi.location || "0,0").split(",");
  const biz = poi.biz_ext || {};
  return {
    id: poi.id || "",
    name: poi.name || "",
    type: poi.type || "",
    address: Array.isArray(poi.address) ? poi.address.join("") : (poi.address || ""),
    lng: Number.parseFloat(rawLng) || 0,
    lat: Number.parseFloat(rawLat) || 0,
    rating: Number.parseFloat(biz.rating) || 4.5,
    cost: Number.parseInt(biz.cost, 10) || 0,
  };
}

export function parsePolyline(polyline) {
  return String(polyline || "")
    .split(";")
    .map((item) => {
      const [lng, lat] = item.split(",");
      return { lng: Number.parseFloat(lng), lat: Number.parseFloat(lat) };
    })
    .filter((p) => Number.isFinite(p.lng) && Number.isFinite(p.lat));
}
