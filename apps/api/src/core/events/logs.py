import logging
import os


async def create_logs_dir() -> None:
    if not os.path.exists("logs"):
        os.mkdir("logs")


# Initiate logging
async def init_logging() -> None:
    await create_logs_dir()

    # Logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        datefmt="%d-%b-%y %H:%M:%S",
        handlers=[logging.FileHandler("logs/cs-mooc.log"), logging.StreamHandler()],
    )

    logging.info("Logging initiated")
