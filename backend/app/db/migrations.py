from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.models.access import PERMISSIONS, AccountAccess, AuditEvent
from backend.app.models.operation import Operation, SchemaMigration, TrashItem
from backend.app.models.share import FileShare
from backend.app.models.upload import UploadBatch
from backend.app.models.user import User


def migrate(engine):
    # Version 2 adds tables only; existing users and sessions are untouched.
    with engine.begin() as connection:
        SchemaMigration.__table__.create(connection, checkfirst=True)
        with Session(bind=connection) as db:
            if db.get(SchemaMigration, 2) is None:
                Operation.__table__.create(connection, checkfirst=True)
                db.add(SchemaMigration(version=2))
                db.flush()
            if db.get(SchemaMigration, 5) is None:
                AccountAccess.__table__.create(connection, checkfirst=True)
                AuditEvent.__table__.create(connection, checkfirst=True)
                for user in db.scalars(select(User)):
                    db.add(
                        AccountAccess(
                            user_id=user.id,
                            role="admin",
                            enabled=True,
                            root="",
                            permissions=PERMISSIONS,
                            must_change_password=False,
                        )
                    )
                db.add(SchemaMigration(version=5))
                db.flush()
            if db.get(SchemaMigration, 3) is None:
                TrashItem.__table__.create(connection, checkfirst=True)
                db.add(SchemaMigration(version=3))
                db.flush()
            if db.get(SchemaMigration, 4) is None:
                UploadBatch.__table__.create(connection, checkfirst=True)
                db.add(SchemaMigration(version=4))
                db.flush()
            if db.get(SchemaMigration, 6) is None:
                FileShare.__table__.create(connection, checkfirst=True)
                db.add(SchemaMigration(version=6))
                db.flush()
