"""Orphan upload reaper — nightly background task.

Runs two sweeps:
1. Delete FINALIZED uploads that were never referenced (referenced_count == 0)
   and were finalised more than 24 hours ago.
2. Cancel CREATED/RECEIVING uploads that were started more than 1 hour ago and
   never finalised (likely abandoned by the client).

This is intentionally simple: it runs in-process on the same DB session and
does not need a distributed lock because the deletes are idempotent.
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, select

from src.db.uploads import Upload, UploadStatus

log = logging.getLogger(__name__)

# Orphan thresholds (see §4.1 of the overhaul plan)
_FINALIZED_ORPHAN_TTL = timedelta(hours=24)
_PENDING_ORPHAN_TTL = timedelta(hours=1)


def reap_orphan_uploads(db_session: Session) -> dict[str, int]:
    """Delete unreferenced uploads and cancel stale pending uploads.

    Returns a dict with counts of affected rows per action.
    """
    now = datetime.now(UTC)
    cancelled = 0
    deleted = 0

    # --- Cancel stale CREATED / RECEIVING uploads ---
    stale_cutoff = now - _PENDING_ORPHAN_TTL
    stale = db_session.exec(
        select(Upload).where(
            Upload.status.in_([UploadStatus.CREATED, UploadStatus.RECEIVING]),
            Upload.created_at < stale_cutoff,
        )
    ).all()
    for upload in stale:
        upload.status = UploadStatus.CANCELLED
        upload.updated_at = now
        db_session.add(upload)
        cancelled += 1

    # --- Delete unreferenced FINALIZED uploads ---
    orphan_cutoff = now - _FINALIZED_ORPHAN_TTL
    orphans = db_session.exec(
        select(Upload).where(
            Upload.status == UploadStatus.FINALIZED,
            Upload.referenced_count == 0,
            Upload.finalized_at < orphan_cutoff,
        )
    ).all()
    for upload in orphans:
        db_session.delete(upload)
        deleted += 1

    db_session.commit()
    log.info("upload_reaper: cancelled=%d deleted=%d", cancelled, deleted)
    return {"cancelled": cancelled, "deleted": deleted}
