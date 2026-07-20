from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config.config import settings
from app.database.session import engine, Base
from app.core.middleware import RateLimitingMiddleware
from app.api import auth, users, documents, chat, admin, workspace
from app.core.logging_config import setup_logging
import logging
import os

# Setup structured JSON logging
setup_logging()
logger = logging.getLogger("app.main")

# Auto-create tables in development (Alembic can manage production schemas)
try:
    from app.models.eval import EvaluationMetric
    from app.models.workspace import Workspace
    Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.error(f"Postgres not ready yet, skipping auto-migration. Error: {e}", exc_info=True)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Multi-Agent Enterprise Knowledge Intelligence Platform API",
    version="1.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
origins = [
    settings.FRONTEND_URL,
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Apply Rate Limiting Middleware
app.add_middleware(RateLimitingMiddleware)

# Include Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(chat.router, prefix=settings.API_V1_STR)
app.include_router(admin.router, prefix=settings.API_V1_STR)
app.include_router(workspace.router, prefix=settings.API_V1_STR)

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "docs": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "healthy"}
