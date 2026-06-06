import { db, ensureAuthSchema, missingDb, nowIso, requireUser } from "../_auth.js";
import { json } from "../_lib.js";

function tripFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    steps: JSON.parse(row.steps_json || "[]"),
    plan: JSON.parse(row.plan_json || "{}"),
    created_at: row.created_at,
  };
}

export async function onRequestGet({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);
  const { response, user } = await requireUser(database, request);
  if (response) return response;

  const result = await database.prepare(`
    SELECT * FROM trips
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(user.id).all();
  return json({ ok: true, items: (result.results || []).map(tripFromRow) });
}

export async function onRequestPost({ request, env }) {
  const database = db(env);
  if (!database) return missingDb();
  await ensureAuthSchema(database);
  const { response, user } = await requireUser(database, request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const createdAt = nowIso();
  const title = String(body.title || "").trim() || "未命名行程";
  const summary = String(body.summary || "").trim();
  const stepsJson = JSON.stringify(Array.isArray(body.steps) ? body.steps : []);
  const planJson = JSON.stringify(body.plan || {});
  const result = await database.prepare(`
    INSERT INTO trips(user_id, title, summary, steps_json, plan_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(user.id, title, summary, stepsJson, planJson, createdAt).run();
  const row = await database.prepare(
    "SELECT * FROM trips WHERE id = ? AND user_id = ?",
  ).bind(result.meta.last_row_id, user.id).first();
  return json({ ok: true, item: tripFromRow(row) });
}

