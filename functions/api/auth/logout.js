import { bearerToken, db, ensureAuthSchema, missingDb } from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);
  await database.prepare("DELETE FROM sessions WHERE token = ?").bind(bearerToken(request)).run();
  return json({ ok: true });
}

