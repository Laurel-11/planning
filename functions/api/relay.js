import { json } from "../_lib.js";

export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));
  const plan = body.plan || {};
  const audience = body.audience || "family";
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const isFriends = audience === "friends";
  const focus = steps.map((step) => {
    const venue = step.venue || {};
    return isFriends
      ? `📍 ${step.slot || "行程"}：${venue.name || "地点"}，人均 ¥${venue.price_per_person || "?"}`
      : `${step.slot || "行程"}：${venue.name || "地点"}`;
  });
  return json({
    audience,
    headline: isFriends ? "周末局安排上了，看看这个行程👇" : "这个方案已经帮你考虑好了👇",
    plan_id: plan.id || "",
    focus_points: focus.length ? focus : ["方案已为你量身定制"],
    quick_actions: isFriends ? ["可以，就这么定 ✓", "换个地方", "我有建议"] : ["就这个！", "换个餐厅", "我有更好的想法"],
  });
}

