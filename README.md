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

前端默认调用同源 `/api/*`。如果部署平台支持 serverless/functions，可以实现同样路径；仓库中的 `functions/` 是 Cloudflare Pages Functions 版本。若部署到其它平台，也可以复用同样接口约定，或设置 `API_BASE_URL` 指向独立后端。

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
backend/app/
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
  assets/leo-avatar.png.png

functions/
  api/                   Cloudflare Pages Functions API
  config.js              Cloudflare 环境变量生成前端配置

serve.py                 本地完整前后端调试入口
requirements.txt         Python 依赖
.env.example             环境变量模板
```

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
