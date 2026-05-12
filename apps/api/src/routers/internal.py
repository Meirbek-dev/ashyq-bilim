"""Internal endpoints — metrics, health, dead-letter inspection.

These are NOT exposed to end users. Mount under /internal/ with appropriate
network-level access control (e.g., only accessible from the cluster).
"""

from fastapi import APIRouter

from src.infra.metrics import METRICS
from src.services.events.bus import get_event_bus

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get("/metrics")
async def get_metrics():
    """Return all Prometheus-compatible metrics."""
    return METRICS.collect_all()


@router.get("/health")
async def health_check():
    """Basic health check."""
    return {"status": "ok"}


@router.get("/dead-letters")
async def get_dead_letters():
    """Return the event bus dead-letter queue for diagnostics."""
    bus = get_event_bus()
    return {
        "count": len(bus.dead_letters),
        "entries": [
            {
                "handler": entry.handler_name,
                "event_type": type(entry.event).__name__,
                "error": entry.error,
                "occurred_at": entry.occurred_at.isoformat(),
            }
            for entry in bus.dead_letters
        ],
    }


@router.post("/dead-letters/clear")
async def clear_dead_letters():
    """Clear the dead-letter queue."""
    bus = get_event_bus()
    count = bus.clear_dead_letters()
    return {"cleared": count}
