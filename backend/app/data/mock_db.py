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
    Venue(
        id="act_006", name="798艺术区涂鸦巡游", category="文艺",
        distance_km=4.5, travel_minutes=22, rating=4.6, price_per_person=0,
        tags=["免费", "文艺", "拍照", "网红"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="北京最具艺术气息的街区，街头涂鸦+画廊+文艺小店，随走随看。",
        address="北京市朝阳区酒仙桥路4号798艺术区",
        lat=39.9839, lng=116.4973,
    ),
    Venue(
        id="act_007", name="朝阳公园湖边漫步", category="公园",
        distance_km=5.5, travel_minutes=25, rating=4.7, price_per_person=5,
        tags=["大公园", "湖边", "亲子", "老少皆宜"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="北京最大城市公园，湖边步道宽阔，有儿童游乐区，适合家庭。",
        address="北京市朝阳区朝阳公园路1号",
        lat=39.9340, lng=116.4721,
    ),
    Venue(
        id="act_008", name="望京小街夜生活漫步", category="citywalk",
        distance_km=1.1, travel_minutes=8, rating=4.5, price_per_person=60,
        tags=["夜晚", "网红", "边走边吃", "年轻人"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="望京最热闹的步行街，夜晚灯光迷人，小吃和精品咖啡汇聚。",
        address="北京市朝阳区望京街10号",
        lat=40.0032, lng=116.4718,
    ),
    Venue(
        id="act_009", name="欢乐谷主题乐园", category="主题乐园",
        distance_km=8.5, travel_minutes=35, rating=4.4, price_per_person=280,
        tags=["刺激", "大型乐园", "适合家庭", "全天玩"], kid_friendly=True,
        has_reservation=True, queue_minutes=45,
        description="北京最大主题乐园，过山车+水上项目+儿童区，适合全家一日游。",
        address="北京市朝阳区东四环小武基北路",
        lat=39.9050, lng=116.4730,
    ),
    Venue(
        id="act_010", name="三里屯太古里逛街", category="购物休闲",
        distance_km=6.0, travel_minutes=28, rating=4.6, price_per_person=150,
        tags=["购物", "出片", "餐厅多", "年轻人聚集"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="北京时尚地标，国际品牌+特色餐厅+网红打卡点汇聚。",
        address="北京市朝阳区三里屯路19号",
        lat=39.9325, lng=116.4562,
    ),
    Venue(
        id="act_011", name="北京奥林匹克公园", category="公园",
        distance_km=4.0, travel_minutes=20, rating=4.8, price_per_person=0,
        tags=["免费", "地标", "鸟巢水立方", "亲子"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="鸟巢、水立方环绕的奥林匹克公园，免费入园漫步，宏伟壮观。",
        address="北京市朝阳区国家体育场南路",
        lat=40.0060, lng=116.3910,
    ),
    Venue(
        id="act_012", name="南锣鼓巷胡同游", category="历史文化",
        distance_km=8.0, travel_minutes=35, rating=4.5, price_per_person=50,
        tags=["历史", "胡同", "文艺小店", "冰糖葫芦"], kid_friendly=True,
        has_reservation=False, queue_minutes=0,
        description="北京最古老的胡同之一，创意小店+传统小吃，极具老北京风味。",
        address="北京市东城区南锣鼓巷",
        lat=39.9384, lng=116.4001,
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
    Venue(
        id="res_006", name="碳佐麻里·烤肉居酒屋", category="餐厅", cuisine="烤肉/居酒屋",
        distance_km=2.5, travel_minutes=14, rating=4.7, price_per_person=180,
        tags=["烤肉", "居酒屋", "聚会", "夜宵"], kid_friendly=False,
        has_reservation=True, queue_minutes=20, has_private_room=True,
        description="日式氛围烤肉居酒屋，肉质新鲜，酒水种类多，朋友夜宵首选。",
        address="北京市朝阳区望京798附近",
        lat=39.9920, lng=116.4880,
    ),
    Venue(
        id="res_007", name="海底捞火锅（望京店）", category="餐厅", cuisine="火锅",
        distance_km=1.8, travel_minutes=11, rating=4.8, price_per_person=145,
        tags=["火锅", "服务好", "适合聚会", "有包厢"], kid_friendly=True,
        has_reservation=True, queue_minutes=35, has_kid_seat=True, has_private_room=True,
        description="超高口碑连锁火锅，服务贴心，底料丰富，家庭聚会朋友局都宜。",
        address="北京市朝阳区望京科技园阜通东大街6号",
        lat=40.0015, lng=116.4820,
    ),
    Venue(
        id="res_008", name="外婆家·江南菜", category="餐厅", cuisine="江南菜",
        distance_km=3.2, travel_minutes=16, rating=4.6, price_per_person=85,
        tags=["清淡", "家常菜", "适合家庭", "性价比高"], kid_friendly=True,
        has_reservation=True, queue_minutes=25, has_kid_seat=True, low_cal_options=True,
        description="江南风味家常菜，清淡少油，适合带老人孩子用餐，性价比突出。",
        address="北京市朝阳区望京SOHO附近",
        lat=39.9970, lng=116.4910,
    ),
    Venue(
        id="res_009", name="星巴克臻选北京坊旗舰店", category="咖啡厅", cuisine="咖啡/甜品",
        distance_km=5.0, travel_minutes=25, rating=4.7, price_per_person=80,
        tags=["咖啡", "打卡", "拍照", "下午茶"], kid_friendly=True,
        has_reservation=False, queue_minutes=10, low_cal_options=True,
        description="北京最美星巴克，三层建筑配专属咖啡体验，适合下午茶约会打卡。",
        address="北京市西城区北京坊1号",
        lat=39.9002, lng=116.3863,
    ),
    Venue(
        id="res_010", name="大董烤鸭·望京店", category="餐厅", cuisine="北京烤鸭",
        distance_km=2.0, travel_minutes=12, rating=4.9, price_per_person=220,
        tags=["烤鸭", "北京特色", "高端", "适合宴请"], kid_friendly=True,
        has_reservation=True, queue_minutes=15, has_kid_seat=True, has_private_room=True,
        description="意境烤鸭创始人，皮脆肉嫩，外国朋友来北京必体验，摆盘精致。",
        address="北京市朝阳区望京A05地块",
        lat=40.0020, lng=116.4840,
    ),
    Venue(
        id="res_011", name="云海肴·云南菜", category="餐厅", cuisine="云南菜",
        distance_km=2.8, travel_minutes=15, rating=4.5, price_per_person=95,
        tags=["特色菜", "云南风味", "有包厢", "环境好"], kid_friendly=True,
        has_reservation=True, queue_minutes=20, has_private_room=True, low_cal_options=True,
        description="正宗云南菜，松茸菌锅+玫瑰米线，环境清新，适合朋友聚餐。",
        address="北京市朝阳区望京中环南路",
        lat=39.9955, lng=116.4775,
    ),
    Venue(
        id="res_012", name="太二酸菜鱼", category="餐厅", cuisine="川菜/酸菜鱼",
        distance_km=1.5, travel_minutes=10, rating=4.6, price_per_person=75,
        tags=["酸菜鱼", "热闹", "排队网红", "朋友聚餐"], kid_friendly=False,
        has_reservation=True, queue_minutes=30,
        description="风格独特的酸菜鱼专门店，一鱼一锅，口味鲜辣，朋友局气氛满分。",
        address="北京市朝阳区望京广顺北大街",
        lat=40.0035, lng=116.4795,
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
     "img_emoji": "🏙️", "heat": "🔥🔥🔥", "tip": "周末下午光线最美，适合出片",
     "lat": 39.9960, "lng": 116.4899, "price": 0, "duration_min": 60},
    {"id": "d2", "name": "阜通小吃街夜市", "category": "美食",
     "img_emoji": "🍢", "heat": "🔥🔥🔥🔥", "tip": "周六晚上最热闹，边走边吃",
     "lat": 40.0012, "lng": 116.4750, "price": 50, "duration_min": 90},
    {"id": "d3", "name": "绿堤公园亲子骑行", "category": "亲子",
     "img_emoji": "🌿", "heat": "🔥🔥", "tip": "免费带娃遛弯，可租亲子车",
     "lat": 40.0055, "lng": 116.4650, "price": 0, "duration_min": 60},
    {"id": "d4", "name": "798艺术区涂鸦巡游", "category": "文艺",
     "img_emoji": "🎨", "heat": "🔥🔥🔥🔥", "tip": "免费逛，多个画廊展览",
     "lat": 39.9839, "lng": 116.4973, "price": 0, "duration_min": 180},
    {"id": "d5", "name": "朝阳公园湖边漫步", "category": "公园",
     "img_emoji": "🚴", "heat": "🔥🔥🔥", "tip": "北京最大城市公园，周末人气高",
     "lat": 39.9340, "lng": 116.4721, "price": 5, "duration_min": 120},
    {"id": "d6", "name": "三里屯太古里逛街", "category": "购物",
     "img_emoji": "🛍️", "heat": "🔥🔥🔥🔥🔥", "tip": "北京时尚地标，逛完正好吃饭",
     "lat": 39.9325, "lng": 116.4562, "price": 0, "duration_min": 150},
    {"id": "d7", "name": "奥林匹克公园夜景", "category": "地标",
     "img_emoji": "🏟️", "heat": "🔥🔥🔥", "tip": "鸟巢夜晚亮灯超壮观，免费参观",
     "lat": 40.0060, "lng": 116.3910, "price": 0, "duration_min": 90},
    {"id": "d8", "name": "南锣鼓巷胡同游", "category": "历史文化",
     "img_emoji": "🏮", "heat": "🔥🔥🔥", "tip": "老北京胡同风情，冰糖葫芦好吃",
     "lat": 39.9384, "lng": 116.4001, "price": 50, "duration_min": 120},
    {"id": "d9", "name": "望京小街夜生活", "category": "夜生活",
     "img_emoji": "🌃", "heat": "🔥🔥🔥", "tip": "夜晚灯光美，网红咖啡馆集中地",
     "lat": 40.0032, "lng": 116.4718, "price": 40, "duration_min": 80},
    {"id": "d10", "name": "欢乐谷主题乐园", "category": "主题乐园",
     "img_emoji": "🎢", "heat": "🔥🔥🔥🔥", "tip": "朋友家庭都适合，刺激好玩",
     "lat": 39.9050, "lng": 116.4730, "price": 280, "duration_min": 360},
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
