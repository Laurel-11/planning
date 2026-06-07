"""规划引擎：隐性约束推断 + 多方案生成。

两大职责：
1. infer_constraints —— 把"孩子5岁""伴侣减脂""别离家太远"等显性/隐性信息
   转成结构化约束，每条都带"为什么"（用于向用户解释推荐理由）。
2. build_plans —— 基于约束，调用工具层搜索候选，组合出多套主题方案：
   活动 → 正餐 → 可选附加活动。

这是本产品的差异化核心：不是搜索过滤，而是"主动帮用户想到自己没想到的"。
"""
from __future__ import annotations

from ..models.schemas import (
    Constraint, ParsedIntent, Plan, PlanStep, Scene, Venue,
)
from ..tools import poi, restaurant


# ============ 隐性约束推断 ============

def infer_constraints(intent: ParsedIntent) -> list[Constraint]:
    """从意图推断结构化约束。每条约束都记录来源与理由。"""
    cons: list[Constraint] = []

    # "别离家太远" → 通勤时长上限（家庭带娃更严格）
    has_child = any(m.role == "child" for m in intent.members)
    max_travel = 12 if has_child else 20
    cons.append(Constraint(
        key="max_travel_minutes", value=str(max_travel), source="inferred",
        reason="用户希望'别离家太远'" + ("，且带5岁孩子，进一步收紧通勤半径" if has_child else ""),
    ))

    # 孩子年龄 → 亲子友好 + 活动强度限制
    for m in intent.members:
        if m.role == "child":
            cons.append(Constraint(
                key="kid_friendly", value="true", source="inferred",
                reason=f"同行有{m.age or 5}岁孩子，场地需亲子友好、强度不能太大",
            ))
            cons.append(Constraint(
                key="need_kid_seat", value="true", source="inferred",
                reason="带幼儿就餐，餐厅需提供儿童座椅",
            ))
        if m.role == "spouse" and m.note and ("减肥" in m.note or "减脂" in m.note):
            cons.append(Constraint(
                key="low_cal_diet", value="true", source="inferred",
                reason="配偶最近在减肥，餐厅优先低卡/轻食并展示卡路里",
            ))

    # 朋友场景 → 聚会属性
    if intent.scene == Scene.FRIENDS:
        cons.append(Constraint(
            key="need_private_room", value="true", source="inferred",
            reason="多人朋友聚会，优先有包厢、适合热闹聊天的餐厅",
        ))
        cons.append(Constraint(
            key="group_activity", value="true", source="inferred",
            reason="朋友结伴，活动偏向成人向（展览/运动），非亲子",
        ))

    return cons


def _con_value(cons: list[Constraint], key: str) -> str | None:
    for c in cons:
        if c.key == key:
            return c.value
    return None


# ============ 时间排布 ============

def _time_after(start: str, minutes: int) -> str:
    h, m = map(int, start.split(":"))
    total = h * 60 + m + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def _make_step(order: int, slot: str, start: str, duration_min: int,
               venue: Venue, why: str) -> tuple[PlanStep, str]:
    end = _time_after(start, duration_min)
    step = PlanStep(order=order, slot=slot, time_range=f"{start}-{end}",
                    venue=venue, why=why)
    return step, end


# ============ 多方案生成 ============

async def build_plans(intent: ParsedIntent,
                      cons: list[Constraint]) -> list[Plan]:
    """生成多套主题方案。

    家庭场景：亲子优先 / 减脂友好（若配偶减肥）
    朋友场景：性价比聚会 / 出片体验
    """
    max_travel = int(_con_value(cons, "max_travel_minutes") or 20)
    kid_friendly = _con_value(cons, "kid_friendly") == "true"
    low_cal = _con_value(cons, "low_cal_diet") == "true"
    need_kid_seat = _con_value(cons, "need_kid_seat") == "true"
    need_room = _con_value(cons, "need_private_room") == "true"

    plans: list[Plan] = []

    if intent.scene == Scene.FAMILY:
        plans.append(await _build_family_kid_first(
            intent, max_travel, kid_friendly, need_kid_seat, low_cal))
        if low_cal:
            plans.append(await _build_family_diet_first(
                intent, max_travel, kid_friendly, need_kid_seat))
    elif intent.scene == Scene.FRIENDS:
        plans.append(await _build_friends_value(intent, max_travel, need_room))
        plans.append(await _build_friends_vibe(intent, max_travel, need_room))
    else:
        # 兜底：通用方案
        plans.append(await _build_friends_value(intent, max_travel, need_room))

    return plans


async def _build_family_kid_first(intent, max_travel, kid_friendly,
                                  need_kid_seat, low_cal) -> Plan:
    acts = await poi.search_activities(kid_friendly=True, max_travel_minutes=max_travel)
    res = await restaurant.search_restaurants(
        low_cal=low_cal or None, need_kid_seat=need_kid_seat,
        max_travel_minutes=max_travel)

    act = acts[0]
    # 亲子主题优先：标签含"亲子/游乐区/儿童餐"的餐厅排在按评分之前
    meal = next((r for r in res if any(t in "".join(r.tags) for t in ("亲子", "游乐", "儿童"))), res[0])
    start = intent.start_time
    s1, t1 = _make_step(1, "活动", start, 90, act,
                        f"亲子友好（{','.join(act.tags[:2])}），5岁孩子可玩，通勤{act.travel_minutes}分钟")
    diet_note = "，且为低卡轻食兼顾减脂" if meal.low_cal_options else ""
    s2, t2 = _make_step(2, "正餐", _time_after(t1, 20), 90, meal,
                        f"提供儿童座椅，{','.join(meal.tags[:2])}{diet_note}")
    extra = next((a for a in acts if a.id != act.id), None)
    steps = [s1, s2]
    if extra:
        s3, _ = _make_step(3, "附加活动", _time_after(t2, 15), 60, extra,
                          f"饭后散步消食，{extra.category}，轻松收尾")
        steps.append(s3)

    total_cost = sum(s.venue.price_per_person for s in steps) * intent.party_size
    total_min = 90 + 20 + 90 + (75 if extra else 0)
    return Plan(
        id="plan_family_kid", title="亲子优先方案", theme="kid_first", steps=steps,
        total_cost=total_cost, total_minutes=total_min,
        highlights=["全程亲子友好", "餐厅备儿童椅", f"通勤均≤{max_travel}分钟"],
    )


async def _build_family_diet_first(intent, max_travel, kid_friendly,
                                   need_kid_seat) -> Plan:
    acts = await poi.search_activities(kid_friendly=True, max_travel_minutes=max_travel)
    res = await restaurant.search_restaurants(
        low_cal=True, need_kid_seat=need_kid_seat, max_travel_minutes=max_travel)
    # 优先选户外/活动量大的，配合减脂主题
    act = next((a for a in acts if "户外" in a.category or "晒太阳" in " ".join(a.tags)), acts[0])
    meal = res[0]
    start = intent.start_time
    s1, t1 = _make_step(1, "活动", start, 90, act,
                        "户外活动量适中，配合减脂，孩子也能参与")
    s2, _ = _make_step(2, "正餐", _time_after(t1, 20), 90, meal,
                      f"低卡轻食，每道菜标卡路里，减脂期友好；同时有儿童座椅")
    steps = [s1, s2]
    total_cost = sum(s.venue.price_per_person for s in steps) * intent.party_size
    return Plan(
        id="plan_family_diet", title="减脂友好方案", theme="diet_first", steps=steps,
        total_cost=total_cost, total_minutes=200,
        highlights=["餐厅低卡可看卡路里", "户外活动助消耗", "兼顾孩子需求"],
    )


async def _build_friends_value(intent, max_travel, need_room) -> Plan:
    acts = await poi.search_activities(kid_friendly=False, max_travel_minutes=max_travel)
    res = await restaurant.search_restaurants(
        need_private_room=need_room, max_travel_minutes=max_travel)
    act = next((a for a in acts if a.price_per_person <= 80), acts[0])
    meal = next((r for r in res if r.has_private_room), res[0])
    start = intent.start_time
    s1, t1 = _make_step(1, "活动", start, 90, act,
                        f"{act.category}，人均仅¥{act.price_per_person}，4人结伴热闹")
    s2, _ = _make_step(2, "正餐", _time_after(t1, 20), 120, meal,
                      f"有包厢适合{intent.party_size}人聚会，人均¥{meal.price_per_person}")
    steps = [s1, s2]
    total_cost = sum(s.venue.price_per_person for s in steps) * intent.party_size
    return Plan(
        id="plan_friends_value", title="性价比聚会方案", theme="value_first", steps=steps,
        total_cost=total_cost, total_minutes=230,
        highlights=[f"{intent.party_size}人聚会包厢", "人均可控", "热闹氛围"],
    )


async def _build_friends_vibe(intent, max_travel, need_room) -> Plan:
    acts = await poi.search_activities(kid_friendly=False, max_travel_minutes=max_travel)
    res = await restaurant.search_restaurants(
        need_private_room=need_room, max_travel_minutes=max_travel)
    act = next((a for a in acts if "出片" in " ".join(a.tags) or "文艺" in " ".join(a.tags)), acts[-1])
    meal = next((r for r in res if "出片" in " ".join(r.tags)), res[0])
    start = intent.start_time
    s1, t1 = _make_step(1, "活动", start, 90, act,
                        f"{act.category}，氛围出片，适合拍照打卡")
    s2, _ = _make_step(2, "正餐", _time_after(t1, 20), 120, meal,
                      f"环境出片有格调，2男2女聚餐有面子")
    steps = [s1, s2]
    total_cost = sum(s.venue.price_per_person for s in steps) * intent.party_size
    return Plan(
        id="plan_friends_vibe", title="出片体验方案", theme="vibe_first", steps=steps,
        total_cost=total_cost, total_minutes=230,
        highlights=["展览/拍照出片", "餐厅有格调", "适合发朋友圈"],
    )
