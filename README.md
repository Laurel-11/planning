# Leisure Done

本地生活规划 demo：用户用自然语言描述下午想怎么过，系统会解析偏好、生成活动方案、展示路线地图、提供 Leo 助手追问，并支持发现页和历史行程。

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

当前 Cloudflare Functions 已覆盖 `/config.js`、LLM 和高德地图相关接口；账号、会话和历史行程仍由 FastAPI + SQLite 实现。部署到 Cloudflare Pages 时有两种选择：

1. 保留完整 Python 后端：把 FastAPI 部署到支持 Python 的平台，并在 Cloudflare 环境变量里设置 `API_BASE_URL=https://你的后端域名`。
2. 全部放在 Cloudflare：把账号和历史行程接口改写为 Pages Functions，并使用 Cloudflare D1 作为 SQL 数据库。

若部署到其它平台，也可以复用同样接口约定，或设置 `API_BASE_URL` 指向独立后端。

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
  DESIGN.md              产品与架构设计说明
  FRONTEND_AND_PYDANTIC_NOTES.md

functions/
  api/                   Cloudflare Pages Functions API
  config.js              Cloudflare 环境变量生成前端配置

serve.py                 本地完整前后端调试入口
requirements.txt         Python 依赖
.env.example             环境变量模板
```

## 账号与游客访问

前端启动后会先显示登录层，用户可以登录、注册，或者选择游客访问。游客访问不会创建账号，也不会阻止原有规划、地图和发现功能。
左上角头像会打开使用教程弹窗，内容同步维护在 `docs/USER_GUIDE.md`。

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

当前 SQLite 账号库适用于 `serve.py` 本地调试或部署一个持久运行的 Python/FastAPI 后端。本地数据库默认在 `instance/leisure_done.sqlite3`，该目录和 `*.sqlite3` 已被 `.gitignore` 忽略，不需要也不应该上传到 Cloudflare。

如果只部署到 Cloudflare Pages Functions，需要把账号和历史接口改接 Cloudflare D1，或把 `API_BASE_URL` 指向独立后端，否则 Pages Functions 版本不会共享这份 SQLite 数据库。D1 方案的表结构可按当前 SQLite schema 建：

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

在 Cloudflare Pages Functions 中把 D1 绑定命名为 `DB` 后，可通过 `context.env.DB.prepare(...).bind(...).run()` / `.first()` / `.all()` 访问 SQL。

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
