"""意图解析：把一句自然语言目标解析为结构化 ParsedIntent。

混合策略：
1. 先用规则引擎从中文文本抽取场景/成员/时长/位置（零依赖、确定性）。
2. 若启用 LLM，用其结果补全/校正规则的盲区（可选增强）。

规则引擎覆盖赛题两个场景：
- 家庭：孩子5岁、老婆减肥
- 朋友：4人、2男2女
"""
from __future__ import annotations

import re

from ..models.schemas import Member, ParsedIntent, Scene, UserRequest
from .llm import llm


# 中文数字 → 阿拉伯数字（覆盖常见小数量）
_CN_NUM = {"一": 1, "两": 2, "二": 2, "三": 3, "四": 4, "五": 5,
           "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}


def _cn_to_int(s: str) -> int | None:
    if s.isdigit():
        return int(s)
    return _CN_NUM.get(s)


def _extract_duration(text: str) -> float:
    """抽取目标时长（小时）。'几个小时' / '4-6小时' / '下午' 等。"""
    m = re.search(r"(\d+)\s*[-到~]\s*(\d+)\s*小时", text)
    if m:
        return (int(m.group(1)) + int(m.group(2))) / 2
    m = re.search(r"(\d+)\s*个?小时", text)
    if m:
        return float(m.group(1))
    if "几个小时" in text or "下午" in text:
        return 4.0
    return 4.0


def _extract_members(text: str) -> tuple[Scene, list[Member]]:
    """识别场景与成员画像。"""
    members: list[Member] = []
    scene = Scene.UNKNOWN

    has_spouse = bool(re.search(r"老婆|妻子|爱人|媳妇|老公|丈夫", text))
    has_child = bool(re.search(r"孩子|娃|宝宝|儿子|女儿|小孩", text))
    has_friend = bool(re.search(r"朋友|哥们|姐妹|同事", text))

    if has_spouse or has_child:
        scene = Scene.FAMILY
        if has_spouse:
            note = "最近在减肥" if re.search(r"减肥|减脂|瘦身", text) else None
            members.append(Member(role="spouse", note=note))
        if has_child:
            age = None
            m = re.search(r"(\d+|[一二两三四五六七八九十])\s*岁", text)
            if m:
                age = _cn_to_int(m.group(1))
            members.append(Member(role="child", age=age))
    elif has_friend:
        scene = Scene.FRIENDS
    else:
        scene = Scene.SOLO

    return scene, members


def _extract_party_size(text: str, scene: Scene, members: list[Member]) -> int:
    """推断总人数。"""
    # 显式"总共N个人" / "N个人"
    m = re.search(r"(?:总共|一共)?\s*(\d+|[一二两三四五六七八九十])\s*个?人", text)
    if m:
        n = _cn_to_int(m.group(1))
        if n:
            return n
    if scene == Scene.FAMILY:
        # 发起人 + 配偶 + 孩子
        return 1 + len(members)
    if scene == Scene.FRIENDS:
        return 4  # 赛题默认朋友场景 4 人
    return 1


def _rule_parse(req: UserRequest) -> ParsedIntent:
    text = req.text
    scene, members = _extract_members(text)
    duration = _extract_duration(text)
    party_size = req.party_size or _extract_party_size(text, scene, members)
    location = req.location or "望京"

    return ParsedIntent(
        scene=scene, members=members, party_size=party_size,
        duration_hours=duration, start_time="14:00",
        location=location, raw_text=text,
    )


async def parse_intent(req: UserRequest) -> ParsedIntent:
    """解析意图：规则先行，LLM 可选增强。"""
    intent = _rule_parse(req)

    # LLM 增强：仅在规则识别为 UNKNOWN/SOLO 等低置信场景时尝试补全
    if llm.enabled and intent.scene in (Scene.UNKNOWN, Scene.SOLO):
        system = ("你是出行意图解析器。从用户中文输入中提取 JSON："
                  '{"scene":"family|friends|couple|solo","party_size":int,'
                  '"duration_hours":float,"members":[{"role":"spouse|child|friend","age":int|null,"note":str|null}]}')
        data = await llm.complete_json(system, req.text)
        if data:
            try:
                intent.scene = Scene(data.get("scene", intent.scene.value))
                intent.party_size = data.get("party_size", intent.party_size)
                intent.duration_hours = data.get("duration_hours", intent.duration_hours)
                if data.get("members"):
                    intent.members = [Member(**m) for m in data["members"]]
            except Exception:
                pass  # LLM 结果异常时保留规则结果

    return intent
