"""
闲时达本地开发服务器 —— 单文件，零依赖，一条命令启动。

使用方法：
    python serve.py

然后浏览器打开 http://localhost:8080
（必须用 http://localhost 访问，直接双击 HTML 会因浏览器 CORS 安全策略
无法调用 DeepSeek API 和高德地图）
"""
import http.server, socketserver, os, sys, webbrowser

PORT   = int(os.environ.get("PORT", 8080))
FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=FOLDER, **kw)

    def end_headers(self):
        # 允许前端直接调用 DeepSeek / 高德 REST API
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 静默日志，减少干扰

if __name__ == "__main__":
    os.chdir(FOLDER)
    url = f"http://localhost:{PORT}"
    print(f"\n  闲时达 · Leisure Done")
    print(f"  ✓ 服务已启动 → {url}")
    print(f"  按 Ctrl+C 停止\n")
    webbrowser.open(url)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  服务已停止")
