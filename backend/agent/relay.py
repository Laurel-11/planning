"""接力适配层：产品核心创新。

当用户把手机递给 TA/朋友时，不让对方看同一个界面重新理解，
而是自动切换"视角"，用对方最关心的维度重新渲染方案，并解释
"这是专门为你考虑的"——降低群体决策摩擦，提升方案通过率。

build_relay_card 根据受众，从同一份 Plan 里提取不同的关注点。
"""
from __future__ import annotations

from ..models.schemas import Audience, Plan, RelayCard, Scene


def build_relay_card(plan: Plan, audience: Audience, scene: Scene) -> RelayCard:
    """为指定受众重新渲染方案卡。"""
    if audience == Audience.SPOUSE:
        return _spouse_card(plan)
    if audience == Audience.FRIENDS:
        return _friends_card(plan)
    return _self_card(plan)


def _self_card(plan: Plan) -> RelayCard:
    """发起人视角：决策总览。"""
    focus = [f"总花费约 ¥{plan.total_cost}",
             f"总时长约 {plan.total_minutes // 60} 小时"]
    focus += plan.highlights
    return RelayCard(
        audience=Audience.SELF,
        headline=f"为你规划了「{plan.title}」，确认后我来一键安排：",
        plan_id=plan.id, focus_points=focus,
        quick_actions=["确认执行", "看看其它方案", "调整某个环节"],
    )


def _spouse_card(plan: Plan) -> RelayCard:
    """同行者视角：突出'专门为你/孩子考虑'的体贴点。"""
    focus: list[str] = []
    for step in plan.steps:
        v = step.venue
        if step.slot == "正餐":
            if v.low_cal_options:
                focus.append(f"🥗 {v.name}：低卡轻食，每道菜标卡路里 —— 专门为你减脂筛选")
            if v.has_kid_seat:
                focus.append(f"🪑 已为宝宝准备儿童座椅")
        elif v.kid_friendly:
            focus.append(f"🎠 {step.slot}：{v.name}，孩子能玩得开心（{','.join(v.tags[:2])}）")
    if not focus:
        focus = plan.highlights
    return RelayCard(
        audience=Audience.SPOUSE,
        headline="这份方案已经专门考虑了这些👇",
        plan_id=plan.id, focus_points=focus,
        quick_actions=["就这个！", "换个餐厅", "我有更好的想法"],
    )


def _friends_card(plan: Plan) -> RelayCard:
    """朋友视角：突出人均、聚会属性、出片。"""
    focus: list[str] = []
    for step in plan.steps:
        v = step.venue
        if step.slot == "正餐":
            room = "有包厢" if v.has_private_room else ""
            focus.append(f"🍻 {v.name}：人均¥{v.price_per_person} {room}，适合一起热闹")
        else:
            focus.append(f"📍 {step.slot}：{v.name}，人均¥{v.price_per_person}")
    focus.append(f"💰 AA 的话每人约 ¥{plan.total_cost // max(1, _party(plan))}")
    return RelayCard(
        audience=Audience.FRIENDS,
        headline="周末局安排上了，看看这个行程👇",
        plan_id=plan.id, focus_points=focus,
        quick_actions=["可以，就这么定", "换个地方", "我加个建议"],
    )


def _party(plan: Plan) -> int:
    """从总价反推人数不可靠，这里用步骤的 venue 不含人数，
    故由调用方在 total_cost 计算时已乘人数；此处用 4 作朋友默认。"""
    return 4
