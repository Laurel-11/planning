import { json, missing } from "./_lib.js";

const AVATAR_COLORS = [
  "#1abc9c", "#2ecc71", "#3498db", "#9b59b6",
  "#f39c12", "#e67e22", "#e74c3c", "#16a085",
  "#27ae60", "#2980b9", "#8e44ad", "#d35400",
];

const PBKDF2_ITERATIONS = 100000;
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 60 * 1000;
export const LOGIN_FORM_ATTEMPT_KEY = "__login_form__";

export function db(env) {
  return env.DB || null;
}

export function missingDb() {
  return missing("D1 binding DB");
}

export function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const [scheme, token] = value.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? (token || "").trim() : "";
}

export function cookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("=") || "");
  }
  return "";
}

export function sessionToken(request) {
  return cookieValue(request, "session") || bearerToken(request);
}

export function sessionCookie(token) {
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
}

export function clearSessionCookie() {
  return "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export async function ensureAuthSchema(database) {
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#22c98a',
      created_at TEXT NOT NULL
    )
  `).run();
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await database.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)").run();
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();
  await database.prepare(`
    CREATE INDEX IF NOT EXISTS idx_trips_user_id_created_at
    ON trips(user_id, created_at DESC)
  `).run();
  await database.prepare(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      username TEXT PRIMARY KEY COLLATE NOCASE,
      failures INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `).run();
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    avatar_color: row.avatar_color || "#22c98a",
    created_at: row.created_at,
  };
}

export function nowIso() {
  return new Date().toISOString();
}

export function validateUsername(username) {
  const value = String(username || "").trim();
  if (value.length < 3) throw new Error("用户名长度必须至少为 3 个字符");
  if (value.length > 16) throw new Error("用户名长度不能超过 16 个字符");
  return value;
}

export function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 6) throw new Error("密码长度必须至少为 6 个字符");
  if (value.length > 16) throw new Error("密码长度不能超过 16 个字符");
  return value;
}

export async function loginLockMessage(database, username) {
  const row = await database.prepare(
    "SELECT locked_until FROM login_attempts WHERE username = ? COLLATE NOCASE",
  ).bind(username).first();
  const lockedUntil = Number.parseInt(row?.locked_until || "0", 10);
  const remainingMs = lockedUntil - Date.now();
  if (row && lockedUntil > 0 && remainingMs <= 0) {
    await clearFailedLogins(database, username);
    return "";
  }
  if (remainingMs <= 0) return "";
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `账号或密码错误次数过多，请 ${seconds} 秒后再试`;
}

export async function recordFailedLogin(database, username) {
  const row = await database.prepare(
    "SELECT failures FROM login_attempts WHERE username = ? COLLATE NOCASE",
  ).bind(username).first();
  const failures = (Number.parseInt(row?.failures || "0", 10) || 0) + 1;
  const lockedUntil = failures >= MAX_LOGIN_FAILURES ? Date.now() + LOGIN_LOCK_MS : 0;
  await database.prepare(`
    INSERT INTO login_attempts(username, failures, locked_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
      failures = excluded.failures,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
  `).bind(username, failures, lockedUntil, nowIso()).run();
  return lockedUntil ? "账号或密码错误次数过多，请 60 秒后再试" : "用户名或密码错误";
}

export async function clearFailedLogins(database, username) {
  await database.prepare("DELETE FROM login_attempts WHERE username = ? COLLATE NOCASE").bind(username).run();
}

export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomAvatarColor() {
  const data = new Uint8Array(1);
  crypto.getRandomValues(data);
  return AVATAR_COLORS[data[0] % AVATAR_COLORS.length];
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function passwordIterations(row = {}) {
  const value = Number.parseInt(row.password_iterations ?? row.iterations ?? "", 10);
  return Number.isFinite(value) && value > 0 ? Math.min(value, PBKDF2_ITERATIONS) : PBKDF2_ITERATIONS;
}

export async function hashPassword(password, saltHex = "", iterations = PBKDF2_ITERATIONS) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const rounds = Math.min(Number.parseInt(iterations, 10) || PBKDF2_ITERATIONS, PBKDF2_ITERATIONS);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export function timingSafeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export async function createSession(database, userId) {
  const token = randomToken();
  await database.prepare(
    "INSERT INTO sessions(token, user_id, created_at) VALUES (?, ?, ?)",
  ).bind(token, userId, nowIso()).run();
  return token;
}

export async function getUserByToken(database, token) {
  if (!token) return null;
  const row = await database.prepare(`
    SELECT users.id, users.username, users.created_at, users.avatar_color
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).bind(token).first();
  return publicUser(row);
}

export async function requireUser(database, request) {
  const user = await getUserByToken(database, sessionToken(request));
  if (!user) return { response: json({ detail: "请先登录" }, 401), user: null };
  return { response: null, user };
}
