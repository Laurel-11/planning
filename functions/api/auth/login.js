import {
  createSession,
  db,
  ensureAuthSchema,
  hashPassword,
  missingDb,
  publicUser,
  timingSafeEqual,
  validateUsername,
} from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);

  const body = await request.json().catch(() => ({}));
  let username;
  try {
    username = validateUsername(body.username);
  } catch (error) {
    return json({ detail: error.message }, 400);
  }

  const row = await database.prepare(
    "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
  ).bind(username).first();
  if (!row) return json({ detail: "Invalid username or password" }, 401);

  const { hash } = await hashPassword(String(body.password || ""), row.password_salt);
  if (!timingSafeEqual(hash, row.password_hash)) {
    return json({ detail: "Invalid username or password" }, 401);
  }
  const user = publicUser(row);
  const token = await createSession(database, user.id);
  return json({ ok: true, user, token });
}

