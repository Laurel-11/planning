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
  assets/leo-avatar.png.png
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

这使得本地 FastAPI、Cloudflare Pages Functions、Vercel/Netlify functions 或独立后端都能复用同一个前端。

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
