import { json } from "../_lib.js";

export async function onRequestPost({ request }) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "");
  const isSolo = /一个人|独自|自己/.test(text);
  const partySize = isSolo ? 1 : (/朋友|同事|聚会/.test(text) ? 4 : 2);
  const plan = {
    id: `cf_plan_${Date.now()}`,
    title: isSolo ? "轻松独处路线" : "轻松半日路线",
    theme: "cloudflare_fallback",
    highlights: ["路线集中", "节奏轻松", "可按天气微调"],
    total_minutes: 180,
    total_cost: 120,
    steps: [
      {
        order: 1,
        slot: "活动",
        time_range: "14:00-15:30",
        why: "先安排一个轻松、不赶路的活动点。",
        venue: {
          id: "fallback_1",
          name: "天安门广场",
          address: "北京市东城区东长安街",
          lat: 39.9087,
          lng: 116.3975,
          rating: 4.8,
          price_per_person: 0,
          category: "公园景点",
          tags: [],
          kid_friendly: true,
        },
      },
      {
        order: 2,
        slot: "正餐",
        time_range: "16:00-17:30",
        why: "活动后安排附近用餐，减少转场。",
        venue: {
          id: "fallback_2",
          name: "王府井周边餐厅",
          address: "北京市东城区王府井",
          lat: 39.9155,
          lng: 116.411,
          rating: 4.5,
          price_per_person: 120,
          category: "餐厅",
          tags: [],
          kid_friendly: true,
        },
      },
    ],
  };
  return json({
    session_id: `cf_${Date.now()}`,
    intent: {
      scene: isSolo ? "solo" : "family",
      members: [],
      party_size: partySize,
      duration_hours: 3,
      start_time: "14:00",
      location: "当前位置",
      raw_text: text,
      constraints: [],
    },
    plans: [plan],
    recommended_plan_id: plan.id,
    reasoning_steps: [
      { title: "识别需求", detail: "根据输入生成半日出行方案" },
      { title: "云端兜底", detail: "Cloudflare Function 已返回可用方案" },
    ],
  });
}

