import { clearSessionCookie, db, ensureAuthSchema, missingDb, sessionToken } from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);
  await database.prepare("DELETE FROM sessions WHERE token = ?").bind(sessionToken(request)).run();
  const response = json({ ok: true });
  response.headers.set("set-cookie", clearSessionCookie());
  return response;
}
