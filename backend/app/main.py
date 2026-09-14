from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    apartments,
    auth,
    comments,
    planning,
    projects,
    reports,
    rooms,
    time_entries,
    users,
    workflow_stages,
)
from app.core.config import settings

app = FastAPI(title="DetailFlow API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(apartments.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")
app.include_router(comments.router, prefix="/api")
app.include_router(time_entries.router, prefix="/api")
app.include_router(workflow_stages.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(planning.router, prefix="/api")


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
