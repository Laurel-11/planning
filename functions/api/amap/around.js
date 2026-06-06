import { amapFetch, json, normalizePoi } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { response, data } = await amapFetch(env, "/v3/place/around", {
    location: url.searchParams.get("location") || "",
    keywords: url.searchParams.get("keywords") || "",
    types: url.searchParams.get("types") || "",
    radius: url.searchParams.get("radius") || "3000",
    offset: url.searchParams.get("offset") || "12",
    extensions: "all",
  });
  if (response) return response;
  return json({
    count: Number.parseInt(data.count, 10) || 0,
    pois: (data.pois || []).map(normalizePoi),
  });
}
