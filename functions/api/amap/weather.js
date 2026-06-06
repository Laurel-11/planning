import { amapFetch, json } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const { response, data } = await amapFetch(env, "/v3/weather/weatherInfo", {
    city: url.searchParams.get("city") || "北京",
    output: "json",
  });
  if (response) return response;
  return json({ lives: data.lives || [] });
}
