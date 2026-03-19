import importlib
import logging
import os
from collections.abc import Iterator

from fastapi import FastAPI, HTTPException
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import QueuePool
from sqlmodel import Session, SQLModel, create_engine

from config.config import get_settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Check if we're in test mode
is_testing = os.getenv("TESTING", "false").lower() == "true"


def import_all_models() -> None:
    """
    Dynamically imports all SQLModel definitions from the 'src/db' directory.
    This ensures that SQLModel.metadata.create_all() discovers all defined tables.
    """
    base_dir = "src/db"
    base_module_path = "src.db"
    imported_modules = set()

    try:
        # Recursively walk through the base directory to find all Python files
        for root, _dirs, files in os.walk(base_dir):
            # Filter out __init__.py and non-Python files
            module_files = [
                f for f in files if f.endswith(".py") and f != "__init__.py"
            ]

            # Calculate the module's base path from its directory structure
            # e.g., src/db/models -> src.db.models
            path_diff = os.path.relpath(root, base_dir)
            if path_diff == ".":
                current_module_base = base_module_path
            else:
                current_module_base = (
                    f"{base_module_path}.{path_diff.replace(os.sep, '.')}"
                )

            # Dynamically import each module to register SQLModel metadata
            for file_name in module_files:
                module_name = file_name[:-3]  # Remove the '.py' extension
                full_module_path = f"{current_module_base}.{module_name}"

                if full_module_path not in imported_modules:
                    try:
                        importlib.import_module(full_module_path)
                        imported_modules.add(full_module_path)
                    except ImportError as e:
                        logger.warning(
                            f"Failed to import module {full_module_path}: {e}"
                        )
                    except (AttributeError, TypeError) as e:
                        logger.exception(
                            f"Unexpected error importing {full_module_path}: {e}"
                        )

    except OSError as e:
        logger.exception(f"Critical error during model import: {e}")
        raise


@event.listens_for(Engine, "first_connect")
def set_postgres_optimization(dbapi_connection, connection_record) -> None:
    """Optimize PostgreSQL connections if using PostgreSQL."""
    if hasattr(dbapi_connection, "server_version"):
        cursor = dbapi_connection.cursor()
        # Set optimal work_mem for this session
        cursor.execute("SET work_mem = '64MB'")
        # Enable JIT compilation if available
        cursor.execute("SET jit = on")
        cursor.close()


# Add connection pool monitoring for debugging
@event.listens_for(Engine, "connect")
def receive_connect(dbapi_connection, connection_record) -> None:
    logging.debug("Database connection established")


@event.listens_for(Engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy) -> None:
    logging.debug("Connection checked out from pool")


@event.listens_for(Engine, "checkin")
def receive_checkin(dbapi_connection, connection_record) -> None:
    logging.debug("Connection returned to pool")


# --- Optimized Database Initialization ---

# 1. Import all models to ensure SQLModel's metadata is populated
import_all_models()

# 2. Rebuild models to resolve Pydantic V2 forward references
try:
    from src.db.trails import rebuild_trail_models

    rebuild_trail_models()
except ImportError:
    logger.warning(
        "Could not import 'rebuild_trail_models'. "
        "Ensure it exists if you have Pydantic V2 forward references."
    )
except (AttributeError, RuntimeError) as e:
    logger.exception(f"Error during rebuilding trail models: {e}")


# Global engine instance with caching
_engine: Engine | None = None


def get_database_engine() -> Engine:
    """Get or create the database engine with configuration."""
    global _engine

    if _engine is None:
        # Check if we're in test mode and use SQLite
        if is_testing:
            # Use SQLite for tests
            _engine = create_engine(
                "sqlite:///:memory:",
                echo=False,
                connect_args={"check_same_thread": False},
            )
        else:
            settings = get_settings()
            connection_string = settings.database_config.sql_connection_string

            # Determine database type for optimization
            is_postgres = connection_string.startswith(
                ("postgresql+psycopg://", "postgresql://")
            )

            # Base engine configuration
            engine_kwargs = {
                "echo": False,  # Set to True for SQL debugging
                "future": True,  # Use SQLAlchemy 2.0 style
                "pool_pre_ping": True,  # Test connections for liveness
                "pool_recycle": 3600,  # Recycle connections every hour
            }

            # Database-specific optimizations
            if is_postgres:
                engine_kwargs.update(
                    {
                        "poolclass": QueuePool,
                        "pool_size": 20,  # Increased pool size for PostgreSQL
                        "max_overflow": 30,
                        "pool_timeout": 30,
                    }
                )
            else:
                # Default configuration for other databases
                engine_kwargs.update(
                    {
                        "pool_size": 10,
                        "max_overflow": 20,
                        "pool_timeout": 30,
                    }
                )

            # Create engine with optimized configuration
            _engine = create_engine(connection_string, **engine_kwargs)

    return _engine


# Initialize the engine
engine = get_database_engine()


# --- FastAPI Lifecycle Event Handlers ---


async def connect_to_db(app: FastAPI) -> None:
    """
    FastAPI startup event handler.
    Initializes the database connection and creates all tables if they don't exist.
    """
    try:
        # Get the optimized engine
        db_engine = get_database_engine()

        # Assign the engine to the FastAPI app state for easy access in routes
        app.state.db_engine = db_engine

        # Create all tables defined by SQLModel metadata
        # This is only called once at application startup
        # Only create tables if not in test mode
        if not is_testing:
            SQLModel.metadata.create_all(db_engine)

    except (SQLAlchemyError, OSError) as e:
        logger.exception(f"Database initialization failed: {e}")
        # Log additional context for debugging
        logger.exception(
            f"Connection string type: {type(get_settings().database_config.sql_connection_string)}"
        )
        msg = f"Database connection failed: {e}"
        raise RuntimeError(msg) from e


async def close_database(app: FastAPI) -> None:
    """
    FastAPI shutdown event handler.
    Performs cleanup operations with proper error handling.
    """
    try:
        # Get engine from app state
        if hasattr(app.state, "db_engine"):
            db_engine = app.state.db_engine

            # Dispose of the engine's connection pool
            db_engine.dispose()
            logger.info("Database engine disposed successfully")

        logger.info("Database shutdown completed")

    except (SQLAlchemyError, OSError) as e:
        logger.exception(f"Error during database shutdown: {e}")
        # Don't raise here to allow graceful shutdown


# --- Optimized Database Session Dependency ---


def get_db_session() -> Iterator[Session]:
    """
    FastAPI dependency that provides a database session.
    The session is automatically closed after the request is processed.
    Enhanced with better error handling and performance monitoring.
    """
    db_engine = get_database_engine()

    if is_testing:
        # Simpler session handling for tests
        with Session(db_engine) as session:
            yield session
    else:
        # More robust session handling for production
        session = Session(db_engine)
        try:
            yield session
        except HTTPException:
            # Business-level errors are expected; avoid noisy logs while still
            # rolling back any pending transaction.
            session.rollback()
            raise
        except SQLAlchemyError as e:
            logger.exception(f"Database session error: {e}")
            session.rollback()
            raise
        finally:
            session.close()


# --- Additional Database Utilities ---


def get_db_health() -> dict:
    """
    Check database health and return status information.
    Useful for health checks and monitoring.
    """
    try:
        db_engine = get_database_engine()
        with Session(db_engine) as session:
            # Simple query to test connection
            result = session.exec("SELECT 1 as health_check")
            health_value = result.first()
            logger.debug(f"Health check query result: {health_value}")

            # Defensive check for None and tuple/list length
            if (
                health_value is not None
                and hasattr(health_value, "__getitem__")
                and len(health_value) > 0
                and health_value[0] == 1
            ):
                return {
                    "status": "healthy",
                    "database_type": str(db_engine.dialect.name),
                    "pool_size": db_engine.pool.size()
                    if hasattr(db_engine.pool, "size")
                    else "unknown",
                    "checked_out_connections": db_engine.pool.checkedout()
                    if hasattr(db_engine.pool, "checkedout")
                    else "unknown",
                }
            return {
                "status": "unhealthy",
                "error": f"Invalid health check response: {health_value}",
            }

    except (SQLAlchemyError, OSError) as e:
        logger.exception(f"Database health check failed: {e}")
        return {"status": "unhealthy", "error": str(e)}


async def optimize_database_performance() -> None:
    """
    Run database optimization tasks.
    This can be called periodically or during startup.
    """
    try:
        db_engine = get_database_engine()

        # PostgreSQL-specific optimizations
        if db_engine.dialect.name == "postgresql":
            with Session(db_engine) as session:
                # Analyze tables for better query planning
                session.exec("ANALYZE;")
                logger.info("PostgreSQL ANALYZE completed")

        # SQLite-specific optimizations
        elif db_engine.dialect.name == "sqlite":
            with Session(db_engine) as session:
                # Optimize SQLite database
                session.exec("PRAGMA optimize;")
                logger.info("SQLite optimization completed")

    except SQLAlchemyError as e:
        logger.warning(f"Database optimization failed: {e}")
