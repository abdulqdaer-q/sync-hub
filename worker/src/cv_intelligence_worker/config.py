from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _env_any(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _bool_env(*names: str, default: bool = False) -> bool:
    value = _env_any(*names, default="")
    if not value:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _default_cache_dir() -> str:
    return str(Path("./tmp") / "cv_intelligence_worker")


def _has_gemini_key() -> bool:
    return bool(_env_any("CV_MODEL_API_KEY", "CVI_MODEL_API_KEY", "GEMINI_API_KEY", default=""))


def _default_model_base_url() -> str:
    if _has_gemini_key():
        return "https://generativelanguage.googleapis.com/v1beta/openai"
    return "http://127.0.0.1:11434/v1"


def _default_model_api_key() -> str:
    return _env_any("GEMINI_API_KEY", default="local")


def _default_extraction_model() -> str:
    if _has_gemini_key():
        return "gemini-2.5-flash"
    return ""


def _default_embedding_model() -> str:
    if _has_gemini_key():
        return "gemini-embedding-001"
    return "multilingual-e5-base"


def _default_embedding_provider() -> str:
    if _has_gemini_key():
        return "openai"
    return "deterministic"


def _default_embedding_version() -> str:
    if _has_gemini_key():
        return "gemini-embedding-001-768-v1"
    return "deterministic-fnv1a-768-v2"


def _default_model_version() -> str:
    if _has_gemini_key():
        return "gemini-2.5-flash-v1"
    return "heuristic-1.0.0"


def _default_prompt_version() -> str:
    if _has_gemini_key():
        return "openai-json-v1"
    return "heuristic-1.0.0"


@dataclass(frozen=True)
class WorkerConfig:
    source_dir: str = field(default_factory=lambda: _env_any("CV_SOURCE_DIR", "CVI_SOURCE_DIR", default="./cvs"))
    tenant_id: str = field(default_factory=lambda: _env_any("CV_WORKER_TENANT_ID", "CVI_TENANT_ID"))
    uploaded_by: str = field(default_factory=lambda: _env_any("CV_WORKER_UPLOADED_BY", "CVI_UPLOADED_BY"))
    supabase_url: str = field(default_factory=lambda: _env_any("SUPABASE_URL"))
    supabase_anon_key: str = field(default_factory=lambda: _env_any("SUPABASE_ANON_KEY"))
    supabase_access_token: str = field(default_factory=lambda: _env_any("SUPABASE_ACCESS_TOKEN", "CVI_SUPABASE_ACCESS_TOKEN"))
    supabase_service_key: str = field(default_factory=lambda: _env_any("SUPABASE_SERVICE_ROLE_KEY"))
    supabase_storage_bucket: str = field(default_factory=lambda: _env_any("SUPABASE_STORAGE_BUCKET", "SUPABASE_BUCKET", default="cv-originals"))
    cache_dir: str = field(default_factory=lambda: _env_any("CV_WORKER_CACHE_DIR", "CVI_WORKER_CACHE_DIR", default=_default_cache_dir()))
    model_base_url: str = field(default_factory=lambda: _env_any("CV_MODEL_BASE_URL", "CVI_MODEL_BASE_URL", default=_default_model_base_url()))
    model_api_key: str = field(default_factory=lambda: _env_any("CV_MODEL_API_KEY", "CVI_MODEL_API_KEY", "GEMINI_API_KEY", default=_default_model_api_key()))
    extraction_provider: str = field(default_factory=lambda: _env_any("CV_EXTRACTION_PROVIDER", "CVI_EXTRACTION_PROVIDER", default="openai-compatible"))
    extraction_model: str = field(default_factory=lambda: _env_any("CV_EXTRACTION_MODEL", "CVI_EXTRACTION_MODEL", default=_default_extraction_model()))
    embedding_model: str = field(default_factory=lambda: _env_any("CV_EMBEDDING_MODEL", "CVI_EMBEDDING_MODEL", default=_default_embedding_model()))
    embedding_provider: str = field(default_factory=lambda: _env_any("CV_EMBEDDING_PROVIDER", "CVI_EMBEDDING_PROVIDER", default=_default_embedding_provider()))
    embedding_dimension: int = field(default_factory=lambda: int(_env_any("CV_EMBEDDING_DIMENSION", "CVI_EMBEDDING_DIMENSION", default="768")))
    parser_version: str = field(default_factory=lambda: _env_any("CV_PARSER_VERSION", "CVI_PARSER_VERSION", default="1.0.0"))
    model_version: str = field(default_factory=lambda: _env_any("CV_MODEL_VERSION", "CVI_MODEL_VERSION", default=_default_model_version()))
    prompt_version: str = field(default_factory=lambda: _env_any("CV_PROMPT_VERSION", "CVI_PROMPT_VERSION", default=_default_prompt_version()))
    chunk_version: str = field(default_factory=lambda: _env_any("CV_CHUNK_VERSION", "CVI_CHUNK_VERSION", default="1.0.0"))
    embedding_version: str = field(default_factory=lambda: _env_any("CV_EMBEDDING_VERSION", "CVI_EMBEDDING_VERSION", default=_default_embedding_version()))
    artifact_version: str = field(default_factory=lambda: _env_any("CV_ARTIFACT_VERSION", "CVI_ARTIFACT_VERSION", default="1.0.0"))
    request_timeout_seconds: int = field(default_factory=lambda: int(_env_any("CV_REQUEST_TIMEOUT_SECONDS", "CVI_REQUEST_TIMEOUT_SECONDS", default="30")))
    batch_size: int = field(default_factory=lambda: int(_env_any("CV_BATCH_SIZE", "CVI_BATCH_SIZE", default="8")))
    embedding_batch_size: int = field(default_factory=lambda: int(_env_any("CV_EMBEDDING_BATCH_SIZE", "CVI_EMBEDDING_BATCH_SIZE", default="16")))
    user_agent: str = field(default_factory=lambda: _env_any("CVI_USER_AGENT", default="cv-intelligence-worker/0.1.0"))
    device_id: str = field(default_factory=lambda: _env_any("CVI_DEVICE_ID", "CV_WORKER_DEVICE_ID"))
    allow_heuristic_fallback: bool = field(default_factory=lambda: _bool_env("CV_ALLOW_HEURISTIC_FALLBACK", "CVI_ALLOW_HEURISTIC_FALLBACK", default=True))
    delete_synced_bundles: bool = field(default_factory=lambda: _bool_env("CV_DELETE_SYNCED_BUNDLES", "CVI_DELETE_SYNCED_BUNDLES", default=True))

    def cache_path(self) -> Path:
        path = Path(self.cache_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def local_artifact_dir(self, tenant_id: str) -> Path:
        path = self.cache_path() / "tenants" / tenant_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def has_supabase_http_credentials(self) -> bool:
        return bool(
            self.supabase_url and (self.supabase_access_token or self.supabase_anon_key or self.supabase_service_key)
        )

    def auth_token(self) -> str:
        if self.supabase_access_token:
            return self.supabase_access_token
        if self.supabase_service_key:
            return self.supabase_service_key
        return self.supabase_anon_key

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        return cls()
