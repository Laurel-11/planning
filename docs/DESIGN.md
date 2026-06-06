# Leisure Done 设计说明

## 产品目标

Leisure Done 是一个本地生活规划 Agent。用户输入一句自然语言需求后，系统自动推断隐含偏好，生成可执行的下午活动方案，并把活动、餐饮、路线、天气和 Leo 助手整合到一个单页体验中。

## 核心体验

1. 智能规划：根据用户描述识别出行场景、人数、时长、饮食偏好、亲子约束和距离约束。
2. 多方案选择：生成一到多套路线集中、成本可控、风格不同的方案。
3. 路线地图：展示每个站点、步行路线、骑行时间和公共交通时间。
4. Leo 助手：作为独立页面存在，用户可以从任意“问 Leo”入口跳转过去追问。
5. 灵感发现：基于用户当前位置或默认天安门位置，展示周边热门地点。

## 路线规划设计

路线规划由同源接口 `/api/amap/walking` 提供。虽然接口名保留 walking，但返回的是完整出行摘要：

- walking：步行距离、步行时间、步行 polyline，用于地图画线。
- bicycling：自行车骑行时间。
- transit：公交/地铁公共交通最短时间。
- transit_segments：公共交通线路详情。

前端右侧路线卡片展示格式：

```txt
1.2km 步行约15分钟，骑行约6分钟，公共交通约12分钟
公交/地铁：地铁14号线：A站 → B站，3站；公交xxx路：B站 → C站，5站
```

若高德没有返回公共交通方案，则隐藏公共交通时间和线路详情。

## 公共交通详情解析

高德公共交通接口返回多套 `transits` 方案。系统选择 `duration` 最短的方案，并解析其中的 `segments`：

- `walking` 段：保留步行距离和时间。
- `bus.buslines` 段：提取线路名、上车站、下车站、经过站数和耗时。
- 线路名包含“地铁”或“轨道”时标记为 `metro`，否则标记为 `bus`。

目前前端只展示公交/地铁乘坐段；步行接驳段保留在返回数据中，可后续用于更细的路线说明。

## 路线缓存设计

为避免用户反复点击“路线地图”导致重复请求高德 API，前端使用页面内存缓存：

- TTL：30 分钟。
- Key：城市 + 坐标序列。
- 复用条件：路线点未变化且缓存未过期。
- 失效条件：用户更改路线、缓存超过 30 分钟、刷新页面、关闭页面或离开页面。

缓存只存在当前页面生命周期中，不写入 localStorage/sessionStorage，因此不会在刷新后保留旧路线。

## 本地与云端 API 架构

前端默认请求同源 `/api/*`。本地用 `python serve.py` 启动 FastAPI，前端和 API 同源；云端可以用任意平台实现同样接口。

如果前端和 API 分开部署，通过 `/config.js` 注入：

```js
window.APP_CONFIG = {
  API_BASE_URL: "https://api.example.com"
};
```

留空时使用当前页面 origin。

## 密钥边界

- LLM key 和高德 Web Service key 只在服务端或 serverless functions 中使用。
- 高德 Web JS key 会被浏览器加载 SDK 时使用，需要配置域名白名单。
- `frontend/config.js` 是无密钥占位文件；真实运行时由后端或 functions 生成 `/config.js`。

## 前端结构

前端是原生 HTML/CSS/JS 单页应用：

- `index.html`：页面结构和导航。
- `styles.css`：视觉样式、响应式布局、Leo 头像、地图和助手页面。
- `app.js`：状态管理、API 调用、地图渲染、路线缓存、页面切换。

## 后端结构

后端是 FastAPI：

- `main.py`：路由、前端托管、API 聚合。
- `services/amap.py`：高德路线、POI、天气、逆地理封装。
- `agent/`：意图解析、规划、接力、执行。
- `models/schemas.py`：Pydantic 数据模型。

Cloudflare Pages Functions 下的 `functions/api/*` 用于静态站部署时保护服务端密钥。线上 Cloudflare 部署不依赖 FastAPI 或 `serve.py`，只依赖 `frontend/` 静态页面、`functions/`、Cloudflare 环境变量和 D1。

`frontend/_routes.json` 只让 `/config.js` 和 `/api/*` 触发 Functions。`functions/config.js` 动态生成线上配置，`frontend/config.js` 只作为无密钥静态 fallback。

## 账号与游客访问

项目新增轻量账号系统：前端启动时展示登录层，支持登录、注册和游客访问。游客访问不会创建账号，也不阻断原有规划、地图、发现和 Leo 助手功能。游客状态不持久化，刷新或离开页面后会重新显示登录/注册入口。

左上角 agent 头像同时作为使用教程入口，点击后展示 `docs/USER_GUIDE.md` 同步维护的教程内容。

FastAPI 后端通过 `backend/auth.py` 使用 SQLite 保存账号和会话，默认数据库路径为 `AUTH_DB_PATH=instance/leisure_done.sqlite3`。密码只保存 PBKDF2 哈希和盐，不保存明文。

账号接口为：

```txt
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/history
POST /api/history
```

注册用户头像采用账号首字母 + 注册时生成的纯色背景，颜色保存在 `users.avatar_color`。注册用户历史行程写入 `trips` 表；游客历史只保存在前端内存中，刷新或离开页面即销毁，不进入数据库。

当前 SQLite 方案仅用于本地 `serve.py` 调试。本地数据库位于 `instance/leisure_done.sqlite3`，已被 `.gitignore` 忽略，不上传到 Cloudflare。

Cloudflare Pages Functions 已提供以下账号和历史接口，并接入 Cloudflare D1：

```txt
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/history
POST /api/history
```

D1 表结构与 FastAPI SQLite schema 对齐：`users` 保存账号、密码哈希和头像颜色，`sessions` 保存登录 token，`trips` 保存注册用户历史行程。Functions 使用 `DB` 作为 D1 binding 名称，并通过 `context.env.DB.prepare(sql).bind(...).run()` / `.first()` / `.all()` 查询。
