import { json } from "../_lib.js";

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    runtime: "cloudflare-pages-functions",
    d1: Boolean(env.DB),
  });
}

