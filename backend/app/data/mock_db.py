"""虚构数据库：模拟美团 POI / 餐饮 / 票务 / 商品数据。

所有场所坐标基于望京商圈真实地理位置（WGS-84），
可直接在 AMap 地图上渲染，用于替代跳转地图 App。
"""
from __future__ import annotations

from ..models.schemas import Venue

# 用户出发点（望京西地铁站附近）
USER_HOME = {"lat": 40.0000, "lng": 116.4700, "name": "望京（出发点）"}

# ============ 活动场所 ============

ACTIVITIES: list[Venue] = [
    Venue(
        id="act_001", name="奇幻熊亲子乐园", category="亲子乐园",
        distance_km=1.2, travel_minutes=8, rating=4.7, price_per_person=88,
        tags=["室内", "5岁以下免票", "有亲子专区", "空调"], kid_friendly=True,
        has_reservation=True, queue_minutes=10,
        description="室内大型亲子乐园，设独立低龄区，地面软包，适合学龄前儿童。",
        address="北京市朝阳区望京街道阜荣街10号",
        lat=40.0038, lng=116.4821,
    ),
    Venue(
        id="act_002", name="望京 SOHO 当代艺术展", category="展览",
        distance_km=2.8, travel_minutes=15, rating=4.5, price_per_person=60,
        tags=["文艺", "拍照出片", "安静", "适合成人"], kid_friendly=False,
        has_reservation=True, queue_minutes=0,
        description="当代装置艺术特展，氛围安静，适合朋友结伴慢逛拍照。",
        address="北京市朝阳区望京SOHO T1塔",
        lat=39.9960, lng=116.4899,
    ),
    Venue(
        id="act_003", name="阜通东大街 Citywalk 小吃街", category="citywalk",
        distance_km=0.9, travel_minutes=6, rating=4.4, price_per_person=40,
        tags=["边走边吃", "热闹", "网红小吃", "自由度高"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="步行小吃街，沿街网红摊位，走走停停，男女老少皆宜。",
        address="北京市朝阳区阜通东大街",
        lat=40.0012, lng=116.4750,
    ),
    Venue(
        id="act_004", name="星云室内蹦床公园", category="运动",
        distance_km=3.5, travel_minutes=18, rating=4.6, price_per_person=128,
        tags=["刺激", "出汗", "适合年轻人"], kid_friendly=False,
        has_reservation=True, queue_minutes=25,
        description="大型蹦床馆，运动量大，更适合成年朋友释放精力，不建议低龄儿童。",
        address="北京市朝阳区望京东园四区",
        lat=40.0080, lng=116.4930,
    ),
    Venue(
        id="act_005", name="绿堤公园亲子骑行", category="户外",
        distance_km=2.0, travel_minutes=12, rating=4.8, price_per_person=30,
        tags=["户外", "亲子", "晒太阳", "低消费"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="公园绿道，可租亲子双人车，节奏舒缓，适合带娃晒太阳。",
        address="北京市朝阳区望京绿堤公园",
        lat=40.0055, lng=116.4650,
    ),
]

# ============ 餐厅 ============

RESTAURANTS: list[Venue] = [
    Venue(
        id="res_001", name="轻野·低卡沙拉工坊", category="餐厅", cuisine="轻食/沙拉",
        distance_km=1.0, travel_minutes=7, rating=4.6, price_per_person=75,
        tags=["低卡", "减脂友好", "环境清新"], kid_friendly=True,
        has_reservation=True, queue_minutes=15, low_cal_options=True, has_kid_seat=True,
        description="主打低卡轻食，每道菜标注卡路里，减脂期友好，也有儿童餐。",
        address="北京市朝阳区望京街1号院",
        lat=40.0025, lng=116.4730,
    ),
    Venue(
        id="res_002", name="蒸气日料·定食屋", category="餐厅", cuisine="日料",
        distance_km=1.6, travel_minutes=10, rating=4.7, price_per_person=160,
        tags=["低卡", "清淡", "精致", "安静"], kid_friendly=True,
        has_reservation=True, queue_minutes=20, low_cal_options=True, has_kid_seat=True,
        description="蒸物与刺身为主，少油清淡，适合控制饮食人群，环境安静。",
        address="北京市朝阳区望京西园三区18号",
        lat=39.9985, lng=116.4770,
    ),
    Venue(
        id="res_003", name="胖叔铜锅涮肉", category="餐厅", cuisine="火锅",
        distance_km=1.3, travel_minutes=9, rating=4.5, price_per_person=120,
        tags=["热闹", "适合聚会", "有包厢", "管饱"], kid_friendly=True,
        has_reservation=True, queue_minutes=40, has_kid_seat=True, has_private_room=True,
        description="老北京铜锅涮肉，有4-6人包厢，热闹适合朋友聚会，分量足。",
        address="北京市朝阳区望京北路9号",
        lat=40.0045, lng=116.4765,
    ),
    Venue(
        id="res_004", name="椰耀东南亚风味餐厅", category="餐厅", cuisine="东南亚菜",
        distance_km=2.2, travel_minutes=13, rating=4.6, price_per_person=110,
        tags=["出片", "适合聚会", "有包厢", "口味重"], kid_friendly=False,
        has_reservation=True, queue_minutes=30, has_private_room=True,
        description="东南亚风情，环境出片，菜品偏重口适合年轻朋友聚会，有包厢。",
        address="北京市朝阳区望京东路8号",
        lat=39.9975, lng=116.4870,
    ),
    Venue(
        id="res_005", name="麦香亲子主题餐厅", category="餐厅", cuisine="西餐/家常",
        distance_km=0.8, travel_minutes=6, rating=4.8, price_per_person=90,
        tags=["亲子", "有游乐区", "儿童餐", "宝宝椅"], kid_friendly=True,
        has_reservation=True, queue_minutes=25, has_kid_seat=True,
        description="餐厅内设儿童游乐区，提供儿童套餐与宝宝椅，带娃首选。",
        address="北京市朝阳区望京花园东路1号",
        lat=40.0010, lng=116.4715,
    ),
]

# ============ 票务 ============

TICKETS: dict[str, list[dict]] = {
    "act_001": [
        {"type": "成人票", "price": 88, "stock": 50},
        {"type": "儿童票(5岁以下)", "price": 0, "stock": 999},
    ],
    "act_002": [
        {"type": "成人票", "price": 60, "stock": 8},
        {"type": "儿童票", "price": 30, "stock": 20},
    ],
    "act_004": [
        {"type": "畅玩票", "price": 128, "stock": 0},
    ],
}

# ============ 商品 ============

PRODUCTS: dict[str, list[dict]] = {
    "蛋糕": [{"id": "cake_01", "name": "草莓鲜奶小蛋糕(6寸)", "price": 128, "eta_min": 60}],
    "鲜花": [{"id": "flower_01", "name": "11朵粉玫瑰花束", "price": 99, "eta_min": 50}],
    "买菜": [{"id": "grocery_01", "name": "宵夜食材组合(关东煮+饮料)", "price": 45, "eta_min": 40}],
}

# ============ 发现页热门推荐 ============

DISCOVER_SPOTS = [
    {"id": "d1", "name": "望京 SOHO 打卡", "category": "网红地标",
     "img_emoji": "🏙️", "heat": "🔥🔥🔥", "tip": "周末下午光线最美",
     "lat": 39.9960, "lng": 116.4899, "price": 0, "duration_min": 60},
    {"id": "d2", "name": "阜通小吃街夜市", "category": "美食",
     "img_emoji": "🍢", "heat": "🔥🔥🔥🔥", "tip": "周六晚上最热闹",
     "lat": 40.0012, "lng": 116.4750, "price": 50, "duration_min": 90},
    {"id": "d3", "name": "绿堤湖边散步", "category": "休闲",
     "img_emoji": "🌿", "heat": "🔥🔥", "tip": "带娃遛弯免费好去处",
     "lat": 40.0055, "lng": 116.4650, "price": 0, "duration_min": 60},
    {"id": "d4", "name": "望京星巴克旗舰店", "category": "咖啡",
     "img_emoji": "☕", "heat": "🔥🔥🔥", "tip": "拍照打卡必去",
     "lat": 39.9990, "lng": 116.4810, "price": 40, "duration_min": 45},
    {"id": "d5", "name": "朝阳公园自行车道", "category": "运动",
     "img_emoji": "🚴", "heat": "🔥🔥🔥", "tip": "周末骑行人气超高",
     "lat": 39.9340, "lng": 116.4720, "price": 30, "duration_min": 120},
    {"id": "d6", "name": "798艺术区漫游", "category": "文艺",
     "img_emoji": "🎨", "heat": "🔥🔥🔥🔥", "tip": "有多个免费展览",
     "lat": 39.9840, "lng": 116.4970, "price": 0, "duration_min": 180},
]

# ============ 查询函数 ============

def search_activities(kid_friendly: bool | None = None,
                      max_travel_minutes: int | None = None) -> list[Venue]:
    result = ACTIVITIES
    if kid_friendly is not None:
        result = [v for v in result if v.kid_friendly == kid_friendly]
    if max_travel_minutes is not None:
        result = [v for v in result if v.travel_minutes <= max_travel_minutes]
    return sorted(result, key=lambda v: v.rating, reverse=True)


def search_restaurants(low_cal: bool | None = None,
                       need_kid_seat: bool | None = None,
                       need_private_room: bool | None = None,
                       max_travel_minutes: int | None = None) -> list[Venue]:
    result = RESTAURANTS
    if low_cal:
        result = [v for v in result if v.low_cal_options]
    if need_kid_seat:
        result = [v for v in result if v.has_kid_seat]
    if need_private_room:
        result = [v for v in result if v.has_private_room]
    if max_travel_minutes is not None:
        result = [v for v in result if v.travel_minutes <= max_travel_minutes]
    return sorted(result, key=lambda v: v.rating, reverse=True)


def get_venue(venue_id: str) -> Venue | None:
    for v in ACTIVITIES + RESTAURANTS:
        if v.id == venue_id:
            return v
    return None


def get_tickets(venue_id: str) -> list[dict]:
    return TICKETS.get(venue_id, [])


def get_product(category: str) -> dict | None:
    items = PRODUCTS.get(category)
    return items[0] if items else None
