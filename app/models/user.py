from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = 'sqlite:///./database/users.db'
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)

def init_db():
    import os
    import secrets
    from app.utils.log_utils import logger
    if not os.path.exists('./database'): os.makedirs('./database')
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            from app.utils.auth_utils import get_password_hash
            p = secrets.token_urlsafe(18)
            h = get_password_hash(p)
            u = User(username='admin', hashed_password=h, full_name='Admin')
            db.add(u); db.commit()
            print('\n' + '='*50)
            print(f'ADMIN_USER: admin\nADMIN_PASS: {p}')
            print('='*50 + '\n')
            logger.info(f'Created admin with password: {p}')
    except Exception as e:
        print(f'Error seeding admin: {e}')
    finally:
        db.close()
