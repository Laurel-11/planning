import { amapFetch, json, normalizePoi } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { response, data } = await amapFetch(env, "/v3/place/text", {
    keywords: url.searchParams.get("keywords") || "",
    city: url.searchParams.get("city") || "北京",
    types: url.searchParams.get("types") || "",
    page: url.searchParams.get("page") || "1",
    offset: url.searchParams.get("offset") || "10",
    extensions: "base",
  });
  if (response) return response;
  return json({
    count: Number.parseInt(data.count, 10) || 0,
    pois: (data.pois || []).map(normalizePoi),
  });
}
