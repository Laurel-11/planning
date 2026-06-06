# 今日拍板 / Leisure Done

本地生活规划 demo：输入一句自然语言需求，系统推断隐含偏好，生成下午活动方案，并支持接力视角、执行结果和行程卡。

## 直接打开前端

前端是原生 HTML + JS + CSS，不依赖 React/Vue/npm。

直接双击打开：

```txt
frontend/index.html
```

在 `file://` 模式下，页面会自动使用前端内置 mock 数据，不会调用后端，也不会读取任何 API key。

## 运行后端 API

如果需要真实调用 FastAPI 后端：

```bash
pip install -r requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8848
```

然后打开：

```txt
http://127.0.0.1:8848
```

## 配置 DeepSeek / OpenAI 兼容 API

不要把 API key 写进代码。

本地创建或编辑 `.env`：

```env
LLM_API_KEY=
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
SIMULATE_LATENCY=1
```

没有 `LLM_API_KEY` 时，后端会走规则和模板兜底，`/api/health` 里 `llm_enabled` 会是 `false`。

## 配置高德地图

本项目现在同时支持两类高德 API：

- 前端高德 JS API：显示地图、marker、路线图层。
- 后端高德 Web 服务 API：服务端路线规划、POI 搜索。

### 前端 JS API

复制模板：

```txt
frontend/config.example.js -> frontend/config.js
```

然后在 `frontend/config.js` 里填写高德 Web JS API Key：

```js
window.APP_CONFIG = {
  AMAP_JS_API_KEY: "你的高德 Web JS API Key",
  AMAP_SECURITY_JS_CODE: "",
};
```

`frontend/config.js` 已加入 `.gitignore`，不要提交真实 key。

注意：Web JS API Key 会被浏览器加载高德 SDK 时使用，前端 key 本身无法完全隐藏。建议在高德控制台为这个 key 配置可用域名白名单。

### 后端 Web 服务 API

在 `.env` 里填写：

```env
AMAP_WEB_SERVICE_KEY=你的高德 Web 服务 API Key
AMAP_WEB_SERVICE_BASE_URL=https://restapi.amap.com
```

后端会暴露两个接口：

```txt
POST /api/amap/walking
GET  /api/amap/place-search
```

当前前端在通过 `http://127.0.0.1:8848` 打开时，会优先调用后端 `/api/amap/walking` 做步行路线规划；如果后端未配置 key 或接口失败，会自动降级为前端高德 JS API 的 `AMap.Walking`。

## 项目结构

```txt
backend/app/
  main.py                FastAPI 路由与静态文件托管
  config.py              环境变量和 .env 配置
  models/schemas.py      数据模型
  agent/                 意图解析、规划、接力、执行编排
  tools/                 mock 工具层
  data/mock_db.py        mock POI/餐厅/票务数据

frontend/
  index.html             页面结构
  styles.css             页面样式
  app.js                 交互、API 调用、高德地图、file:// mock 数据
  config.example.js      高德地图前端配置模板

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
```
