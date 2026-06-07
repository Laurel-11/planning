import {
  createSession,
  db,
  ensureAuthSchema,
  hashPassword,
  clearFailedLogins,
  LOGIN_FORM_ATTEMPT_KEY,
  loginLockMessage,
  missingDb,
  passwordIterations,
  publicUser,
  recordFailedLogin,
  sessionCookie,
  timingSafeEqual,
} from "../../_auth.js";
import { json } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();

  const lockedMessage = await loginLockMessage(database, LOGIN_FORM_ATTEMPT_KEY);
  if (lockedMessage) return json({ detail: lockedMessage }, 429);

  const row = await database.prepare(
    "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
  ).bind(username).first();
  if (!row) {
    const message = await recordFailedLogin(database, LOGIN_FORM_ATTEMPT_KEY);
    return json({ detail: message.includes("错误次数过多") ? message : "此用户名不存在" }, 401);
  }

  const { hash } = await hashPassword(String(body.password || ""), row.password_salt, passwordIterations(row));
  if (!timingSafeEqual(hash, row.password_hash)) {
    return json({ detail: await recordFailedLogin(database, LOGIN_FORM_ATTEMPT_KEY) }, 401);
  }
  await clearFailedLogins(database, LOGIN_FORM_ATTEMPT_KEY);
  const user = publicUser(row);
  const token = await createSession(database, user.id);
  const response = json({ ok: true, user, token });
  response.headers.set("set-cookie", sessionCookie(token));
  return response;
}
