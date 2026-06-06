import { amapFetch, json } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lng = url.searchParams.get("lng");
  const lat = url.searchParams.get("lat");
  const { response, data } = await amapFetch(env, "/v3/geocode/regeo", {
    location: `${lng},${lat}`,
    extensions: "base",
  });
  if (response) return response;
  const regeocode = data.regeocode || {};
  return json({
    formatted_address: regeocode.formatted_address || "",
    addressComponent: regeocode.addressComponent || {},
  });
}
