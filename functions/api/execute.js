import { json } from "../_lib.js";

export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));
  const plan = body.plan || {};
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const items = steps.map((step) => {
    const venue = step.venue || {};
    const isMeal = step.slot === "正餐";
    return {
      action: isMeal ? "餐厅预约" : "活动预约",
      target: venue.name || "",
      status: "success",
      detail: isMeal ? `已记录 ${venue.name || "餐厅"} 的用餐安排` : `${venue.name || "活动地点"} 可按计划前往`,
      fallback_note: null,
    };
  });
  const timeline = steps.map((step) => `${step.time_range || ""}  ${step.slot || "行程"}：${step.venue?.name || ""}`.trim());
  const summary = `搞定了！${plan.title || "这套行程"} 已整理好。`;
  return json({
    all_success: true,
    items,
    itinerary: {
      summary,
      timeline,
      share_text: [summary, "—— 行程明细 ——", ...timeline].join("\n"),
    },
  });
}

