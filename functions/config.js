export async function onRequestGet({ env }) {
  const config = {
    API_BASE_URL: env.API_BASE_URL || "",
    AMAP_JS_API_KEY: env.AMAP_JS_API_KEY || "",
    AMAP_KEY: env.AMAP_JS_API_KEY || "",
    AMAP_SECURITY_JS_CODE: env.AMAP_SECURITY_JS_CODE || "",
  };
  return new Response(`window.APP_CONFIG = ${JSON.stringify(config)};`, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
