"""Global configuration.

Secrets are loaded from .env or environment variables. Do not hardcode keys.
"""
import os


def _load_dotenv() -> None:
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_dotenv()


class Settings:
    # Optional public API base URL for split frontend/API deployments.
    # Leave empty to let the browser call the same origin.
    API_BASE_URL: str = os.getenv("API_BASE_URL", "")

    # User default location, used by mock planning data.
    DEFAULT_LOCATION: str = "望京"

    # LLM config: DeepSeek/OpenAI-compatible APIs. Never hardcode secrets here.
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    LLM_BASE_URL: str = os.getenv("LLM_BASE_URL", "https://api.deepseek.com/v1")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "deepseek-chat")

    # AMap Web Service API. Server-side only: route planning, POI search, geocoding.
    AMAP_WEB_SERVICE_KEY: str = os.getenv("AMAP_WEB_SERVICE_KEY", "")
    AMAP_WEB_SERVICE_BASE_URL: str = os.getenv(
        "AMAP_WEB_SERVICE_BASE_URL", "https://restapi.amap.com"
    )

    # AMap Web JS API. Browser-facing key for displaying the map SDK.
    AMAP_JS_API_KEY: str = os.getenv("AMAP_JS_API_KEY", "")
    AMAP_SECURITY_JS_CODE: str = os.getenv("AMAP_SECURITY_JS_CODE", "")

    @property
    def llm_enabled(self) -> bool:
        return bool(self.LLM_API_KEY)

    @property
    def amap_web_service_enabled(self) -> bool:
        return bool(self.AMAP_WEB_SERVICE_KEY)

    @property
    def amap_js_api_enabled(self) -> bool:
        return bool(self.AMAP_JS_API_KEY)

    # Tool mock behavior: inject latency/failure for demo realism.
    SIMULATE_LATENCY: bool = os.getenv("SIMULATE_LATENCY", "1") == "1"


settings = Settings()
