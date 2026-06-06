# Pydantic 与前端实现说明

## 1. pydantic==2.10.4 能不能修改？

可以修改，而且从当前运行环境看，建议修改。

本机当前 Python 是 3.14，而 `pydantic==2.10.4` 依赖的 `pydantic-core==2.27.2` 没有适配 Python 3.14。安装时会尝试从源码编译 `pydantic-core`，最终因为 PyO3 / Rust 侧兼容性失败。

如果项目必须继续使用 Python 3.14，更实际的做法是把 Pydantic 升级到支持 Python 3.14 的版本，例如：

```txt
pydantic>=2.12
```

我之前临时跑通项目时，虚拟环境里实际安装的是：

```txt
pydantic==2.13.4
pydantic-core==2.46.4
```

## 2. 修改 Pydantic 需要大改代码吗？

大概率不需要大改。

这个项目主要使用的是 Pydantic v2 的常规写法：

```python
from pydantic import BaseModel, Field
```

现有模型集中在：

```txt
backend/app/models/schemas.py
```

目前看到的用法包括：

- `BaseModel`
- `Field`
- `model_dump()`
- 枚举字段
- list / Optional 类型声明

这些都是 Pydantic v2 的稳定常用接口。从 `2.10.4` 升到 `2.13.x` 通常不需要改业务代码。

更推荐的处理方式是只改依赖声明：

```txt
fastapi==0.115.6
uvicorn==0.34.0
pydantic>=2.12,<3
httpx==0.28.1
```

这样既能兼容 Python 3.14，又不会跳到未来的 Pydantic v3。

如果团队希望最小变更，也可以直接锁定：

```txt
pydantic==2.13.4
```

## 3. 这个项目的前端实现在哪里？

前端是原生单页应用，没有 React / Vue / Vite / npm 工程。

位置在：

```txt
frontend/
```

主要文件是：

```txt
frontend/index.html
frontend/app.js
frontend/styles.css
```

后端通过 FastAPI 托管这些静态文件。入口在：

```txt
backend/app/main.py
```

核心逻辑是：

```python
app.mount("/static", StaticFiles(directory=_FRONTEND_DIR), name="static")

@app.get("/")
async def index():
    return FileResponse(os.path.join(_FRONTEND_DIR, "index.html"))
```

所以浏览器打开：

```txt
http://127.0.0.1:8848
```

实际加载的是：

```txt
frontend/index.html
```

然后页面里的 JS 会调用后端 API，例如：

```txt
POST /api/plan
POST /api/relay
POST /api/execute
POST /api/chat
GET  /api/discover
```

## 4. 如果想用 html + js + css 实现前端，应该怎么做？

这个项目现在已经是 `html + js + css` 的实现方式。

建议继续保持这个结构：

```txt
frontend/
  index.html    页面结构
  styles.css    页面样式
  app.js        页面交互与 API 调用
```

### index.html 负责什么

`index.html` 只负责页面骨架，例如：

- 输入框
- 按钮
- 方案列表容器
- 接力卡片容器
- 执行结果容器
- 引入 CSS 和 JS

示例结构：

```html
<link rel="stylesheet" href="/static/styles.css">

<main id="app">
  <section class="planner">
    <textarea id="requestInput"></textarea>
    <button id="planButton">生成方案</button>
  </section>

  <section id="plans"></section>
  <section id="relay"></section>
  <section id="result"></section>
</main>

<script src="/static/app.js"></script>
```

### app.js 负责什么

`app.js` 负责状态、事件和接口调用，例如：

- 监听按钮点击
- 读取输入
- 调用 `/api/plan`
- 把返回的 plans 渲染到页面
- 点击某个方案后调用 `/api/relay`
- 最后调用 `/api/execute`

请求示例：

```js
async function createPlan(text, location) {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      location
    })
  });

  if (!response.ok) {
    throw new Error("生成方案失败");
  }

  return response.json();
}
```

注意当前后端 `/api/plan` 接收的字段是：

```json
{
  "text": "今天下午想带老婆和5岁孩子出去玩，别太远，老婆最近在减肥",
  "location": "北京市朝阳区"
}
```

不是：

```json
{
  "user_input": "...",
  "start_location": "..."
}
```

### styles.css 负责什么

`styles.css` 负责视觉样式和响应式布局，例如：

- 页面整体布局
- 卡片样式
- 按钮状态
- loading 状态
- 手机端适配
- 方案列表排版

建议不要把样式写到 JS 里，除非是非常小的动态状态，例如添加或移除 class：

```js
button.classList.add("is-loading");
```

样式放在 CSS：

```css
.is-loading {
  opacity: 0.6;
  pointer-events: none;
}
```

## 5. 推荐的前端开发顺序

如果继续用原生前端，可以按这个顺序做：

1. 先确认 API 数据结构
2. 写出静态 HTML 页面骨架
3. 用假数据把页面渲染完整
4. 再接入真实 `/api/plan`
5. 接入 `/api/relay`
6. 接入 `/api/execute`
7. 最后补 loading、错误提示、空状态和移动端适配

这样做的好处是前端不会一开始就被后端数据和异步流程绑住，页面体验也更容易调。

## 6. 结论

这个项目不需要换前端技术栈，因为它本来就是原生 `html + js + css`。

更值得先处理的是 Python 3.14 与旧版 Pydantic 的兼容问题。推荐把：

```txt
pydantic==2.10.4
```

改成：

```txt
pydantic>=2.12,<3
```

这通常只需要改 `backend/requirements.txt`，不需要大规模改后端代码。
