import {
  createSession,
  db,
  ensureAuthSchema,
  hashPassword,
  missingDb,
  nowIso,
  publicUser,
  randomAvatarColor,
  validatePassword,
  validateUsername,
} from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);

  const body = await request.json().catch(() => ({}));
  let username;
  let password;
  try {
    username = validateUsername(body.username);
    password = validatePassword(body.password);
  } catch (error) {
    return json({ detail: error.message }, 400);
  }

  const { hash, salt } = await hashPassword(password);
  const avatarColor = randomAvatarColor();
  const createdAt = nowIso();
  try {
    const result = await database.prepare(`
      INSERT INTO users(username, password_hash, password_salt, avatar_color, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(username, hash, salt, avatarColor, createdAt).run();
    const user = publicUser(await database.prepare(
      "SELECT id, username, avatar_color, created_at FROM users WHERE id = ?",
    ).bind(result.meta.last_row_id).first());
    const token = await createSession(database, user.id);
    return json({ ok: true, user, token });
  } catch (error) {
    return json({ detail: "Username already exists" }, 400);
  }
}

