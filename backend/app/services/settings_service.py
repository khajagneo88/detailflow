from sqlalchemy.orm import Session

from app.models.app_settings import APP_SETTINGS_SINGLETON_ID, AppSettings


def get_or_create_settings(db: Session) -> AppSettings:
    """The one AppSettings row always has id=1. The accompanying migration
    inserts it with the default values, so this should always find a row —
    the create-if-missing fallback here is only a defensive backstop
    against a database that was seeded/migrated before this table existed
    (or a test DB that skipped data migrations), not the expected path."""
    settings_row = db.get(AppSettings, APP_SETTINGS_SINGLETON_ID)
    if settings_row is None:
        settings_row = AppSettings(id=APP_SETTINGS_SINGLETON_ID)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row
