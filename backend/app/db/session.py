from pathlib import Path

from sqlalchemy import URL, create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.db.migrations import migrate
from backend.app.models.user import Base, LoginSession, User


def open_database(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        URL.create("sqlite", database=str(path)), connect_args={"check_same_thread": False, "timeout": 10}
    )
    Base.metadata.create_all(engine, tables=[User.__table__, LoginSession.__table__])
    migrate(engine)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)
