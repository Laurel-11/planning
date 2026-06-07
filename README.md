# Leisure Done

本地生活规划 demo：用户用自然语言描述下午想怎么过，系统会解析偏好、生成活动方案、展示路线地图、提供 Leo 助手追问，并支持发现页和历史行程。

## 目录

- [设计理念](#设计理念)
- [创新点](#创新点)
- [Planning 策略说明](#planning-策略说明)
- [工具调用链路](#工具调用链路)
- [异常处理机制](#异常处理机制)
- [网页版使用教程](#网页版使用教程)
- [本地调试](#本地调试)
- [环境变量](#环境变量)
- [部署思路](#部署思路)
- [Cloudflare Pages 配置](#cloudflare-pages-配置)
- [路线地图](#路线地图)
- [路线缓存](#路线缓存)
- [项目结构](#项目结构)
- [账号与游客访问](#账号与游客访问)
- [主要接口](#主要接口)

## 设计理念

**核心命题：从”帮你找地方”到”帮你把事做完”。**

市面上大多数本地生活 App 解决的是”搜索推荐”问题——用户自己描述需求、自己筛选、自己下单、自己规划路线，最后还要挨个把链接发给家人朋友等确认。闲时达解决的是更深一层的问题：**用户说一句话，系统理解所有人的隐性需求，生成可直接执行的方案，并帮你推给需要确认的人。**

设计上遵循三个原则：

- **主动补全，而不是被动过滤**：用户说”带老婆孩子出去玩”，系统自动推断孩子年龄对应的亲子场所、减脂期对应的低卡餐厅、”别太远”对应的通勤半径上限——每一条推断都带有可见的理由，而不是黑盒筛选。
- **决策权交还给用户，而不是强推单一答案**：系统生成多套主题方案（亲子优先 / 减脂友好 / 朋友聚会 / 出片体验），并用对比图量化每套方案的维度差异，让用户一眼看出风格区别，而不是读三段文字再做决定。
- **群体决策是第一等公民，而不是事后分享**：一个人规划完之后要递给老婆或朋友看——这个”递手机”的时刻是现有产品的盲区。闲时达在这个节点重新渲染方案：老婆看到的是减脂和儿童椅的要点，朋友看到的是人均和包厢，让同一套方案在不同受众面前”说对话”，把群体决策摩擦降到一键拍板。

技术上采用”规则兜底 + DeepSeek 增强 + 高德工具执行”的混合 Agent 架构。规则层保证零 API key 时也能运行，DeepSeek 负责理解模糊表达并结合高德实时 POI 数据生成个性化方案，工具层把方案落到地图路线、餐厅预约、购票和订单等具体执行能力上。

## 创新点

**① 接力模式（行业首创）**

现有产品都在解决”我自己如何规划”，没有产品解决”规划完怎么让家人/朋友认可”。闲时达在方案生成后提供”接力”能力：把手机递给老婆时，界面自动切换到配偶视角——突出减脂友好、儿童座椅、亲子设施；递给朋友时切换到聚会视角——突出人均价格、包厢、聚会属性。同一套方案，不同的人看到自己最在意的内容，把群体决策从”反复沟通”变成”一键拍板”。

**② 隐性约束推断与可视化推理链**

不是简单过滤，而是主动推断用户没说出口的需求，并以”Leo 推理过程”的形式在界面展示：识别场景 → 搜索真实 POI → 推断约束 → 生成方案，每一步都可见、可解释。用户看到的不只是结果，还能看到”为什么这个方案适合你”，建立真实的 AI 信任感。

**③ DeepSeek + 高德 POI 实时双引擎规划**

规划流程分两步：先调 DeepSeek 理解意图、提取关键词；再并行调高德 REST API 搜索用户当前位置附近的真实场所（含评分、地址、坐标）；最后将 POI 数据作为上下文传回 DeepSeek，生成结合真实地点的个性化方案。方案中的每个场所都有可定位的坐标，直接落到地图上，不是凭空编造。

**④ 方案内局部替换——无需整体重规划**

方案生成后，每个步骤下有”换个地方 ↻”按钮。点击后 Leo 仅针对该步骤搜索同类备选（2-3 个），用户一键替换，其余步骤保持不变。评委现场问”能改一下吗”时，这个功能可以直接回应，而不需要重新走完整规划流程。

**⑤ 天气 + 位置感知的动态规划**

获取用户真实地理位置（浏览器定位 + 高德逆地理编码），所有规划、POI 搜索、地图出发点都以真实坐标为中心。同时实时获取当地天气，注入 DeepSeek 规划上下文：雨天自动优先室内活动，晴天优先户外；欢迎语中显示当前天气状态，让 AI 的”主动关怀”对用户可见。

**⑥ 执行闭环 + 行程卡情感化**

用户确认方案后，餐厅预约、购票、额外商品（蛋糕/鲜花）并行执行，执行项以 120ms 间隔逐条滑入，有视觉节奏感。执行完成后根据选择的额外商品生成情感化结尾文案（”蛋糕已悄悄送往餐厅，等着给 TA 一个惊喜 🎂”），并生成包含真实场所和时间线的可转发行程卡。

**⑦ 密钥安全边界 + 零门槛体验**

LLM Key 和高德 Web Service Key 始终留在服务端（FastAPI / Cloudflare Functions），前端只获取公开配置，适合直接从本地 demo 迁移到线上。同时提供游客模式：零注册体验全部核心功能，注册用户历史行程持久化保存，两条路径都不设门槛。

## Planning 策略说明

本地 FastAPI 版本的规划链路由 `backend/agent/orchestrator.py` 编排，核心路径是“理解 → 约束推断 → 多方案生成 → 接力说明 → 执行落地”。

- 意图理解：`intent.py` 先用规则解析中文输入，抽取场景、成员、人数、时长和位置；当配置了 `LLM_API_KEY` 且规则结果置信度较低时，再调用 LLM 补全或校正。
- 约束推断：`planner.infer_constraints()` 把“带 5 岁孩子”“配偶减肥”“别离家太远”等信息转成结构化约束，例如 `kid_friendly`、`low_cal_diet`、`need_kid_seat`、`max_travel_minutes`。
- 多方案生成：`planner.build_plans()` 根据场景生成不同主题方案。家庭场景优先亲子、减脂和儿童座椅；朋友场景优先包厢、性价比和出片体验。
- 推荐策略：当前默认推荐方案列表第一项，保证有确定性输出；如果无法识别具体场景，会回落到通用朋友聚会方案。
- 执行策略：用户确认方案后，`executor.py` 并行处理餐厅预约、活动购票和额外商品下单，再汇总为行程卡。

## 工具调用链路

主要接口链路如下：

```txt
前端 app.js
  → POST /api/plan
  → backend/main.py
  → orchestrator.plan()
  → intent.parse_intent()
  → planner.infer_constraints()
  → planner.build_plans()
  → tools.poi.search_activities()
  → tools.restaurant.search_restaurants()
  → 返回 PlanResponse
```

确认执行时：

```txt
前端 app.js
  → POST /api/execute
  → orchestrator.execute()
  → executor.execute_plan()
  → 并行调用 restaurant.reserve()、ticket.buy_tickets()、order.place_order()
  → tools.itinerary.build_itinerary()
  → 返回 ExecutionResult
```

其它辅助链路：

- `/api/relay`：基于已选方案生成给家人、朋友或自己的接力说明卡。
- `/api/chat`：Leo 助手自由追问，优先调用 DeepSeek/OpenAI-compatible LLM；未配置 key 时返回模板兜底。
- `/api/amap/*`：封装高德 Web Service，用于路线、POI、逆地理和天气。
- Cloudflare Pages 部署时，`functions/api/*` 提供同名接口，保护服务端密钥，并用 D1 保存账号和历史行程。

## 异常处理机制

- LLM 未配置或调用失败：`llm.complete_json()` / `complete_text()` 返回 `None`，调用方保留规则解析或模板兜底结果。
- LLM 返回非标准 JSON：后端 LLM 封装会截取首个 `{` 到末个 `}` 后尝试解析，解析失败则忽略 LLM 结果。
- 餐厅满位：`restaurant.reserve()` 把排队超过 35 分钟视为预约失败，执行层会自动搜索相似备选餐厅并改订；没有备选时标记为 `failed`，但不阻塞其它动作。
- 活动售罄：`ticket.buy_tickets()` 库存不足时返回失败，执行结果给出“现场购票或更换活动”的提示。
- 并行动作互不阻塞：预约、购票、额外商品下单通过 `asyncio.gather()` 并行执行，单项失败不会让整个执行流程崩掉。
- 注册输入校验：用户名会去除首尾空格，长度限制为 3-16 个字符；密码长度限制为 6-16 个字符，不符合时直接返回中文错误提示。
- 重复注册处理：用户名使用大小写不敏感唯一约束，重复注册会返回“该用户名已被使用”，不会覆盖已有账号。
- 登录失败锁定：登录表单连续 5 次用户名或密码错误后，会锁定 60 秒；锁定期间继续登录会返回剩余秒数，成功登录或注册成功后清除失败计数。
- 账号数据保护：密码只保存 PBKDF2 哈希和随机盐，session 使用随机 token；Cloudflare 版本通过 HttpOnly + Secure + SameSite=Lax cookie 保存会话。
- 地图与路线失败：前端优先高德地图和高德路线；高德加载失败时自动切 Leaflet，路线规划失败时保留站点并展示失败提示。
- 定位失败或用户拒绝：前端回落到默认位置，不中断规划、发现页和地图展示。
- `file://` 直接打开：前端显示本地预览提示，不调用真实 AI、定位和地图接口，建议通过 `python serve.py` 使用 HTTP 访问。

## 网页版使用教程

### 闲时达 使用教程

#### 1. 登录或游客访问

打开页面后，你可以注册/登录账号，也可以先选择游客访问。

- 注册用户：历史行程会保存到数据库，之后登录还能继续查看。
- 游客访问：数据只保存在当前页面，刷新或离开后会清空。

#### 2. 生成出行方案

在“智能规划”里告诉 Leo 你的想法，例如：

- 今天下午想和朋友找个地方坐坐
- 上午想带孩子去附近玩，不想走太远
- 一个人想轻松逛逛，顺便吃点东西

Leo 会根据你的时间、位置、天气和偏好生成出行方案。

#### 3. 查看路线地图

生成方案后，点击“路线地图”可以查看每一站的位置和路线信息。

路线会展示步行、骑行和可用的公共交通时间。

#### 4. 灵感发现

“灵感发现”会根据你的位置推荐附近地点。

如果你允许定位，会优先展示当前位置周边；如果没有定位权限，会使用天安门作为默认位置。

#### 5. Leo 助手

点击“Leo 助手”可以继续追问路线、活动安排、餐厅选择或替代方案。

#### 6. 历史行程

注册用户生成过的行程会出现在“历史行程”里，方便之后回顾或重新安排。

游客模式下历史不会写入数据库，刷新后会清空。

## 本地调试

推荐本地调试只用一条命令：

```bash
python serve.py
```

然后打开：

```txt
http://localhost:8080
```

`serve.py` 会启动 FastAPI，并从同一个 origin 提供前端页面、`/config.js` 和所有 `/api/*`。不要直接双击 `frontend/index.html`，`file://` 模式下浏览器会限制定位、AI 和地图接口。

## 环境变量

复制 `.env.example` 为 `.env`，填写本地密钥：

```env
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
SIMULATE_LATENCY=1

API_BASE_URL=
AUTH_DB_PATH=instance/leisure_done.sqlite3

AMAP_WEB_SERVICE_KEY=
AMAP_WEB_SERVICE_BASE_URL=https://restapi.amap.com
AMAP_JS_API_KEY=
AMAP_SECURITY_JS_CODE=
```

说明：

- `LLM_API_KEY` 是服务端使用的 DeepSeek/OpenAI-compatible key，不应进入前端代码。
- `AMAP_WEB_SERVICE_KEY` 用于服务端路线规划、POI、逆地理和天气。
- `AMAP_JS_API_KEY` 会被浏览器加载高德 Web JS SDK 时使用，需要在高德控制台配置域名白名单。
- `API_BASE_URL` 留空代表前端和 API 同源；前后端分离部署时填 API 域名。

## 部署思路

前端默认调用同源 `/api/*`。如果部署平台支持 serverless/functions，可以实现同样路径；仓库中的 `functions/` 是 Cloudflare Pages Functions 版本。

Cloudflare Pages 部署不依赖 FastAPI 或 `serve.py`。线上只依赖：

- `frontend/` 静态页面
- `functions/` Pages Functions
- Cloudflare 环境变量
- Cloudflare D1（binding 名称为 `DB`）

`frontend/_routes.json` 明确让 `/config.js` 和 `/api/*` 走 Pages Functions。正式部署时 `/config.js` 由 `functions/config.js` 动态生成，`frontend/config.js` 只保留为无密钥静态 fallback。

FastAPI 只作为本地调试入口保留：本地运行 `python serve.py` 时继续由 FastAPI 同源提供前端、`/config.js` 和 `/api/*`。

## Cloudflare Pages 配置

Pages 项目连接仓库后，构建设置建议为：

```txt
Build command: 留空
Build output directory: frontend
Root directory: 仓库根目录
Functions directory: functions
```

需要在 Cloudflare Pages 项目中配置环境变量：

```txt
LLM_API_KEY
LLM_BASE_URL
LLM_MODEL
AMAP_WEB_SERVICE_KEY
AMAP_WEB_SERVICE_BASE_URL
AMAP_JS_API_KEY
AMAP_SECURITY_JS_CODE
API_BASE_URL=
```

`API_BASE_URL` 在 Cloudflare Pages 同源部署时留空。账号、会话、历史行程需要创建 Cloudflare D1 数据库，并绑定到 Pages 项目，binding 名称必须是 `DB`。不要上传 `.env`、`instance/` 或本地 SQLite 数据库。

高德 Web JS Key 需要在高德控制台配置 Cloudflare Pages 域名或自定义域名白名单。

## 路线地图

路线接口：

```txt
POST /api/amap/walking
```

请求体：

```json
{
  "city": "北京",
  "points": [
    {"lat": 39.9, "lng": 116.4, "name": "出发点"},
    {"lat": 39.91, "lng": 116.41, "name": "目的地"}
  ]
}
```

返回内容包括：

- 步行距离、步行时间和步行 polyline
- 自行车骑行时间
- 公交/地铁综合公共交通最短时间
- 公共交通具体线路分段，例如线路名、上车站、下车站、经过站数

前端展示格式示例：

```txt
1.2km 步行约15分钟，骑行约6分钟，公共交通约12分钟
公交/地铁：地铁14号线：A站 → B站，3站；公交xxx路：B站 → C站，5站
```

如果高德没有可用公共交通线路，则不显示公共交通部分。

公共交通详情解析策略：

- 高德会返回多套 `transits` 方案，系统选择 `duration` 最短的一套。
- `walking` 段保留步行距离和时间，可用于后续展示更细的接驳说明。
- `bus.buslines` 段会提取线路名、上车站、下车站、经过站数和耗时。
- 线路名包含“地铁”或“轨道”时标记为 `metro`，否则标记为 `bus`。
- 当前前端优先展示公交/地铁乘坐段，步行接驳段保留在接口返回数据中。

## 路线缓存

前端会在页面内存中缓存路线规划结果：

- 缓存有效期：30 分钟
- 缓存维度：城市 + 路线坐标序列
- 用户切换到“路线地图”时，如果路线未变化且缓存未过期，直接复用缓存
- 用户更改路线后，坐标序列变化，会重新规划
- 刷新页面、关闭页面或离开页面后，缓存清空

这样可以避免反复点击路线地图时重复消耗高德 API 额度。

## 项目结构

```txt
backend/
  main.py                FastAPI 路由与前端托管
  config.py              环境变量与 .env 配置
  services/amap.py       高德 Web Service API 封装
  agent/                 意图解析、规划、接力、执行
  data/mock_db.py        mock POI/餐厅/票务数据
  models/schemas.py      Pydantic 数据模型

frontend/
  index.html             页面结构
  styles.css             页面样式
  app.js                 SPA 状态、交互、API 调用、地图
  config.js              无密钥静态占位配置
  assets/leo-avatar.png
  assets/default-user-avatar.png

docs/
  USER_GUIDE.md          使用教程，左上角头像弹窗同步展示
  FRONTEND_AND_PYDANTIC_NOTES.md

functions/
  _auth.js               D1 账号、会话、历史行程工具
  api/                   Cloudflare Pages Functions API
  config.js              Cloudflare 环境变量生成前端配置

serve.py                 本地完整前后端调试入口
requirements.txt         Python 依赖
.env.example             环境变量模板
```

## 账号与游客访问

前端启动后会先显示登录层，用户可以登录、注册，或者选择游客访问。游客访问不会创建账号，也不会阻止原有规划、地图和发现功能。
游客访问或新用户首次注册成功后，会自动弹出网页版使用教程；左上角头像也可以随时重新打开教程，内容同步维护在 `docs/USER_GUIDE.md`。

账号数据由 FastAPI 后端写入 SQLite，密码只保存 PBKDF2 哈希和盐，不保存明文。相关接口：

```txt
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/history
POST /api/history
```

`AUTH_DB_PATH` 是 FastAPI 后端使用的 SQLite 账号数据库路径；相对路径会从项目根目录解析，默认写入 `instance/leisure_done.sqlite3`。

注册用户会被分配一个首字母头像颜色，保存在 `users.avatar_color`。注册用户的历史行程保存在 `trips` 表中；游客访问不写数据库，游客历史只存在当前页面内存里，刷新或离开页面后清空，并会重新出现登录/注册弹窗。

当前 SQLite 账号库仅用于 `serve.py` 本地调试。本地数据库默认在 `instance/leisure_done.sqlite3`，该目录和 `*.sqlite3` 已被 `.gitignore` 忽略，不需要也不应该上传到 Cloudflare。

Cloudflare Pages Functions 使用 D1 保存账号、会话和历史行程。D1 binding 名称必须配置为 `DB`。Functions 会在请求时自动执行 `CREATE TABLE IF NOT EXISTS` 初始化；也可以提前在 D1 控制台执行同一份 schema：

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#22c98a',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trips_user_id_created_at
ON trips(user_id, created_at DESC);
```

Pages Functions 通过 `context.env.DB.prepare(...).bind(...).run()` / `.first()` / `.all()` 访问 SQL。

## 主要接口

```txt
GET  /api/health
GET  /api/discover
POST /api/plan
POST /api/relay
POST /api/execute
POST /api/chat
POST /api/llm
POST /api/amap/walking
GET  /api/amap/place-search
GET  /api/amap/around
GET  /api/amap/regeo
GET  /api/amap/weather
```
