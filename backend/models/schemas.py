"""数据模型定义：整个 Agent 流程中各模块的数据契约。

分为三大类：
- 输入/意图：UserRequest, ParsedIntent, Constraint
- 规划产物：Activity, Restaurant, PlanStep, Plan
- 执行产物：RelayView, ExecutionResult, Itinerary
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ============ 场景与受众 ============

class Scene(str, Enum):
    """出行场景类型，决定隐性约束的推断方向。"""
    FAMILY = "family"      # 家庭（带孩子/伴侣）
    FRIENDS = "friends"    # 朋友聚会
    COUPLE = "couple"      # 二人
    SOLO = "solo"          # 独自
    UNKNOWN = "unknown"


class Audience(str, Enum):
    """接力模式下的目标受众，决定方案重新渲染的视角。"""
    SELF = "self"          # 发起人自己
    SPOUSE = "spouse"      # 配偶
    FRIENDS = "friends"    # 朋友群体
    CHILD = "child"        # 孩子（间接，用于行程友好度）


# ============ 输入与意图 ============

class UserRequest(BaseModel):
    """用户的原始自然语言请求。"""
    text: str = Field(..., description="自然语言目标，如'今天下午想和伴侣孩子出去玩几个小时'")
    location: Optional[str] = Field(None, description="用户当前位置，缺省用配置默认值")
    party_size: Optional[int] = Field(None, description="人数，缺省由意图解析推断")


class Member(BaseModel):
    """同行成员画像，用于推断个性化约束。"""
    role: str                       # 如 "child" / "spouse" / "friend"
    age: Optional[int] = None
    note: Optional[str] = None      # 如 "最近在减肥"


class Constraint(BaseModel):
    """一条结构化约束（显性或隐性推断）。"""
    key: str                        # 如 "max_travel_minutes" / "diet" / "kid_friendly"
    value: str
    source: str                     # "explicit"（用户明说）/ "inferred"（系统推断）
    reason: Optional[str] = None    # 推断理由，用于向用户解释"为什么"


class ParsedIntent(BaseModel):
    """意图解析的结构化输出。"""
    scene: Scene
    members: list[Member] = Field(default_factory=list)
    party_size: int = 1
    duration_hours: float = 4.0     # 目标时长
    start_time: str = "14:00"       # 计划出发时间
    location: str = "望京"
    constraints: list[Constraint] = Field(default_factory=list)
    raw_text: str = ""


# ============ POI / 候选项 ============

class Venue(BaseModel):
    """通用场所/活动候选（来自 mock 数据库）。"""
    id: str
    name: str
    category: str                   # "亲子乐园" / "展览" / "citywalk" / "餐厅" ...
    distance_km: float
    travel_minutes: int
    rating: float
    price_per_person: int           # 人均（元）
    tags: list[str] = Field(default_factory=list)
    kid_friendly: bool = False
    has_reservation: bool = False   # 是否支持预约
    queue_minutes: int = 0          # 当前预估排队时长
    description: str = ""
    address: str = ""               # 详细地址
    lat: float = 0.0                # 纬度（WGS-84）
    lng: float = 0.0                # 经度（WGS-84）
    # 餐厅专用字段
    cuisine: Optional[str] = None
    low_cal_options: bool = False   # 是否有轻食/低卡选项
    has_kid_seat: bool = False
    has_private_room: bool = False


# ============ 规划产物 ============

class PlanStep(BaseModel):
    """方案中的一个环节（一段活动/一顿饭）。"""
    order: int
    slot: str                       # "活动" / "正餐" / "附加活动"
    time_range: str                 # "14:00-15:30"
    venue: Venue
    why: str                        # 为什么选它（结合约束）


class Plan(BaseModel):
    """一套完整的下午方案。"""
    id: str
    title: str                      # 如 "亲子优先方案"
    theme: str                      # "kid_first" / "diet_first" / "value_first"
    steps: list[PlanStep]
    total_cost: int                 # 总预估花费
    total_minutes: int
    highlights: list[str] = Field(default_factory=list)  # 亮点摘要


# ============ 接力视角 ============

class RelayCard(BaseModel):
    """递给特定受众时重新渲染的方案卡。"""
    audience: Audience
    headline: str                   # 针对受众的开场白
    plan_id: str
    focus_points: list[str]         # 针对该受众最关心维度的要点
    quick_actions: list[str]        # 一键反馈选项


# ============ 执行产物 ============

class ExecStatus(str, Enum):
    SUCCESS = "success"
    FALLBACK = "fallback"           # 首选失败，已自动切备选
    FAILED = "failed"               # 需用户手动处理


class ExecutionItem(BaseModel):
    """单个执行动作的结果。"""
    action: str                     # "餐厅预约" / "购票" / "鲜花" ...
    target: str                     # 作用对象名称
    status: ExecStatus
    detail: str                     # 结果详情/确认号
    fallback_note: Optional[str] = None


class Itinerary(BaseModel):
    """最终行程卡，可分享。"""
    summary: str                    # 一句话总结，可直接转发
    timeline: list[str]             # 逐条时间线
    share_text: str                 # 发给朋友的文案


class ExecutionResult(BaseModel):
    """执行 Agent 的完整输出。"""
    items: list[ExecutionItem]
    itinerary: Itinerary
    all_success: bool


# ============ 顶层编排响应 ============

class PlanResponse(BaseModel):
    """/plan 接口返回：意图 + 多套方案。"""
    intent: ParsedIntent
    plans: list[Plan]
    recommended_plan_id: str


class ExecuteRequest(BaseModel):
    """/execute 接口入参：用户确认的方案。"""
    plan: Plan
    extras: list[str] = Field(default_factory=list)  # 额外动作，如 "蛋糕" "鲜花"
