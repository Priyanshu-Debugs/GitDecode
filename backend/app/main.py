"""
GitMesh — FastAPI Application Entry Point
===========================================
Application factory with async lifespan management.

Startup:
    - Initializes Neo4j (AuraDB) driver and verifies connectivity.
    - Creates uniqueness constraints in the graph database.
    - Initializes Supabase PostgreSQL client.
    - Stores both clients in the dependency injection layer.

Shutdown:
    - Gracefully closes the Neo4j driver.
"""

import logging
from dotenv import load_dotenv
load_dotenv()  # Load environment variables from .env globally

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.pg_client import SupabasePGClient
from app.api.dependencies import set_pg_client
from app.api.routes.repos import router as repos_router
from app.api.routes.chat import router as chat_router
from app.api.routes.providers import router as providers_router

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if get_settings().DEBUG else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage application startup and shutdown.

    On startup:
        1. Create and verify the Neo4j driver connection.
        2. Ensure graph database constraints exist.
        3. Create the Supabase PostgreSQL client.
        4. Register both clients in the dependency injection layer.

    On shutdown:
        1. Close the Neo4j driver and release all connections.
    """
    settings = get_settings()

    # ── STARTUP ──────────────────────────────────────────────────────
    logger.info("Starting %s...", settings.PROJECT_NAME)

    # Supabase / PostgreSQL
    pg_client = SupabasePGClient(
        supabase_url=settings.SUPABASE_URL,
        service_role_key=settings.SUPABASE_SERVICE_ROLE_KEY,
    )
    set_pg_client(pg_client)

    logger.info("%s is ready to serve requests", settings.PROJECT_NAME)

    yield

    # ── SHUTDOWN ─────────────────────────────────────────────────────
    logger.info("Shutting down %s...", settings.PROJECT_NAME)
    logger.info("Shutdown complete")


# ── Application Factory ──────────────────────────────────────────────

settings = get_settings()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="AI-powered codebase visualization and analysis tool.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── CORS Middleware ──────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Router Registration ─────────────────────────────────────────────

app.include_router(repos_router, prefix=settings.API_V1_PREFIX)
app.include_router(chat_router, prefix=settings.API_V1_PREFIX)
app.include_router(providers_router, prefix=settings.API_V1_PREFIX)

# ── Inngest Event Server ────────────────────────────────────────────
import inngest.fast_api
from app.workers.inngest_fns import sync_github_repository
from app.api.routes.repos import inngest_client

inngest.fast_api.serve(app, inngest_client, [sync_github_repository])



# ── Health Check ─────────────────────────────────────────────────────


@app.get(
    "/health",
    tags=["infrastructure"],
    summary="Health check",
    description="Returns the service health status. Used by Docker/K8s probes.",
)
async def health_check() -> dict[str, str]:
    """Return a simple health status response."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
    }
