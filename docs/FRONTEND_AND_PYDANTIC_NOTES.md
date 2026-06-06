# 前端与 Pydantic 维护笔记

## 本地开发入口

本地调试使用：

```bash
python serve.py
```

然后访问：

```txt
http://localhost:8080
```

`serve.py` 启动 FastAPI，并同源托管：

- `/`
- `/config.js`
- `/app.js`
- `/styles.css`
- `/assets/*`
- `/api/*`

因此本地不要直接双击 `frontend/index.html`，否则浏览器会进入 `file://` 模式，AI、定位和地图接口都会受限。

## 前端结构

前端是原生 SPA，没有 React/Vue/Vite/npm 构建链：

```txt
frontend/
  index.html
  app.js
  styles.css
  config.js
  assets/leo-avatar.png
```

职责划分：

- `index.html`：页面骨架、导航、主要容器。
- `app.js`：状态、页面切换、API 调用、地图渲染、路线缓存。
- `styles.css`：布局、组件样式、响应式、头像资源。
- `config.js`：无密钥占位；运行时 `/config.js` 由后端或 functions 注入真实公开配置。

## API 调用策略

前端通过 `apiUrl()` 统一生成 API 地址：

- `API_BASE_URL` 为空：使用当前 origin。
- `API_BASE_URL` 不为空：请求指定 API 域名。
- `file://`：不调用真实 API，走降级提示或 mock。

这使得本地 FastAPI 和 Cloudflare Pages Functions 能复用同一个前端。Cloudflare 正式部署时 `API_BASE_URL` 应保持为空，让 `/api/*` 请求走同源 Pages Functions；FastAPI 和 `serve.py` 只用于本地调试。

`frontend/_routes.json` 显式包含 `/config.js` 和 `/api/*`，因此 Cloudflare Pages 会用 `functions/config.js` 动态生成线上配置；`frontend/config.js` 只作为静态 fallback 保留，不作为正式部署配置来源。

当前 `functions/` 已实现 `/config.js`、LLM、高德地图、账号、会话和历史行程接口。账号与历史行程使用 Cloudflare D1，binding 名称为 `DB`。

## 路线缓存

`frontend/app.js` 中维护页面内存缓存：

```js
S.routeCache = new Map()
ROUTE_CACHE_TTL_MS = 30 * 60 * 1000
```

缓存 key 为城市和路线坐标序列。用户反复点击“路线地图”时，如果路线没变并且未超过 30 分钟，就直接复用缓存的 `/api/amap/walking` 结果。

缓存不会写入浏览器持久存储。刷新页面、关闭页面或离开页面后自动清空。

## 公共交通数据

`/api/amap/walking` 返回每段路线的多模式信息：

```json
{
  "distance": 1200,
  "duration": 900,
  "bicycling_duration": 360,
  "transit_duration": 720,
  "transit_segments": [
    {
      "type": "metro",
      "name": "地铁14号线",
      "departure_stop": "A站",
      "arrival_stop": "B站",
      "via_num": 3,
      "duration": 600
    }
  ]
}
```

前端显示：

```txt
1.2km 步行约15分钟，骑行约6分钟，公共交通约12分钟
公交/地铁：地铁14号线：A站 → B站，3站
```

如果没有公共交通方案，不显示公共交通相关内容。

## Pydantic 版本

项目使用 FastAPI + Pydantic v2。当前推荐依赖范围：

```txt
fastapi==0.115.6
uvicorn==0.34.0
pydantic>=2.12,<3
httpx==0.28.1
```

原因：

- Python 3.14 下旧版 `pydantic-core` 可能无法安装。
- 现有代码使用的是 Pydantic v2 常规接口，例如 `BaseModel`、`Field`、`model_dump()`。
- `pydantic>=2.12,<3` 能兼容 Python 3.14，同时避免误升到未来的 v3。

## 修改建议

前端新增功能时优先遵循现有模式：

1. 在 `index.html` 添加必要容器。
2. 在 `app.js` 写状态和行为。
3. 在 `styles.css` 写样式。
4. API 统一走 `apiUrl()` 或 `apiJson()`。
5. 涉及密钥的能力必须放在 FastAPI 或 functions 中，不放进前端。

后端新增结构化数据时，优先使用 Pydantic 模型或清晰的 dict schema，并在 README / DESIGN 中同步说明接口形状。

## 账号与游客访问

前端新增登录层，包含登录、注册、游客访问三个入口。登录和注册调用同源 `/api/auth/*`，成功后把 session token 存入 `localStorage`；游客访问不写入后端，也不持久化游客状态，刷新或离开页面后会重新显示登录/注册入口。

FastAPI 后端使用 `backend/auth.py` 和 SQLite 保存账号，会话接口为：

```txt
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/history
POST /api/history
```

左上角 agent 头像会打开使用教程弹窗，弹窗内容与 `docs/USER_GUIDE.md` 保持一致。注册用户在 Leo 助手消息中显示账号首字母头像，背景色来自后端返回的 `avatar_color`；游客显示默认头像图片。注册用户历史行程走 `/api/history` 写入 SQLite，游客历史只存在页面内存中，刷新后清空并重新显示登录/注册入口。

数据库路径由 `AUTH_DB_PATH` 控制，默认 `instance/leisure_done.sqlite3`。SQLite 和密码哈希使用 Python 标准库，因此 `requirements.txt` 不需要新增依赖。本地 SQLite 数据库和 `instance/` 目录已被 `.gitignore` 忽略，不需要上传。SQLite 只用于本地 `serve.py` 调试。

Cloudflare Pages Functions 部署使用 D1 保留账号功能。D1 binding 必须命名为 `DB`，Functions 中使用：

```js
const user = await context.env.DB
  .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
  .bind(username)
  .first();
```

写入历史行程时使用 `run()`，读取列表时使用 `all()`。D1 表结构与 `backend/auth.py` 中的 `users`、`sessions`、`trips` 保持一致，并由 `functions/_auth.js` 的 `ensureAuthSchema()` 自动初始化。
