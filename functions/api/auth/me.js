import { db, ensureAuthSchema, getUserByToken, missingDb, sessionToken } from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);
  const user = await getUserByToken(database, sessionToken(request));
  return json({ ok: Boolean(user), user });
}
