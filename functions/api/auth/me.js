import { bearerToken, db, ensureAuthSchema, getUserByToken, missingDb } from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);
  const user = await getUserByToken(database, bearerToken(request));
  return json({ ok: Boolean(user), user });
}

