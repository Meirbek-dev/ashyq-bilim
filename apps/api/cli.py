import asyncio
from datetime import date
from typing import Annotated

import typer
from sqlalchemy import create_engine
from sqlalchemy.engine.base import Engine
from sqlmodel import Session, SQLModel, select

from config.config import get_settings
from src.core.platform import PLATFORM_BRAND_NAME
from src.db.platform import Platform, PlatformCreate
from src.db.users import User, UserCreate
from src.services.analytics.rollups import refresh_teacher_analytics_rollups
from src.services.platform import get_platform
from src.services.setup.setup import (
    install_create_platform,
    install_create_platform_user,
    install_default_elements,
)

cli = typer.Typer()


@cli.command()
def install(
    short: Annotated[bool, typer.Option(help="Install with predefined values")] = False,
) -> None:
    # Get the database session
    settings = get_settings()
    engine: Engine = create_engine(
        settings.database_config.sql_connection_string,
        echo=False,
        pool_pre_ping=True,
    )
    SQLModel.metadata.create_all(engine)

    db_session = Session(engine)

    # Install the default elements
    print("Installing default elements...")
    install_default_elements(db_session)
    print("Default elements installed ✅")

    if short:
        bootstrap_config = settings.bootstrap
        admin_email = bootstrap_config.initial_admin_email
        admin_password = bootstrap_config.initial_admin_password

        if not admin_email:
            print(
                "❌ Error: PLATFORM_INITIAL_ADMIN_EMAIL environment variable is required"
            )
            raise typer.Exit(code=1)

        if not admin_password:
            print(
                "❌ Error: PLATFORM_INITIAL_ADMIN_PASSWORD environment variable is required"
            )
            print(
                "Please set PLATFORM_INITIAL_ADMIN_PASSWORD environment variable before running installation."
            )
            raise typer.Exit(code=1)

        # Create the Platform
        print(f"Creating {PLATFORM_BRAND_NAME}...")
        platform_object = PlatformCreate(
            name=PLATFORM_BRAND_NAME,
            description=PLATFORM_BRAND_NAME,
            about=f"{PLATFORM_BRAND_NAME} - Образовательная платформа для онлайн-обучения",
            email=settings.contact_email,
            logo_image="",
            thumbnail_image="",
            label=PLATFORM_BRAND_NAME,
        )
        install_create_platform(platform_object, db_session)
        print(f"{PLATFORM_BRAND_NAME} created ✅")

        # Create Admin User
        print(f"Creating {PLATFORM_BRAND_NAME} admin user...")
        print(
            f"Using email from PLATFORM_INITIAL_ADMIN_EMAIL environment variable: {admin_email}"
        )
        print(
            "Using password from PLATFORM_INITIAL_ADMIN_PASSWORD environment variable"
        )
        user = UserCreate(
            username="Admin",
            email=str(admin_email),
            password=admin_password,
        )
        asyncio.run(install_create_platform_user(user, db_session))
        print(f"{PLATFORM_BRAND_NAME} user created ✅")

        # Show the user how to login
        print("Installation completed ✅")
        print()
        print("Login with the following credentials:")
        print("email: " + str(admin_email))
        print("password: (the password you set in PLATFORM_INITIAL_ADMIN_PASSWORD)")
        print("⚠️ Remember to change the password after logging in ⚠️")

    else:
        # Create the Platform
        print("Creating your platform...")
        app_name = typer.prompt("What's shall we call your platform?")
        platform_object = PlatformCreate(
            name=app_name,
            description=PLATFORM_BRAND_NAME,
            email="",
            logo_image="",
            thumbnail_image="",
        )
        install_create_platform(platform_object, db_session)
        print(app_name + " platform created ✅")

        # Create Admin User
        print("Creating your admin user...")
        username = typer.prompt("What's the username for the user?")
        email = typer.prompt("What's the email for the user?")
        password = typer.prompt("What's the password for the user?", hide_input=True)
        user = UserCreate(username=username, email=email, password=password)
        asyncio.run(install_create_platform_user(user, db_session))
        print(username + " user created ✅")

        # Show the user how to login
        print("Installation completed ✅\n")
        print("Login with the following credentials:")
        print("email: " + email)
        print("password: The password you entered")


@cli.command()
def main() -> None:
    cli()


@cli.command()
def refresh_analytics(
    snapshot_date: Annotated[
        str | None, typer.Option(help="Optional snapshot date in YYYY-MM-DD format")
    ] = None,
) -> None:
    settings = get_settings()
    engine: Engine = create_engine(
        settings.database_config.sql_connection_string,
        echo=False,
        pool_pre_ping=True,
    )
    db_session = Session(engine)
    parsed_snapshot = date.fromisoformat(snapshot_date) if snapshot_date else None
    result = refresh_teacher_analytics_rollups(
        db_session, snapshot_date=parsed_snapshot
    )
    print(result)


@cli.command()
def migrate_users_to_platform() -> None:
    """Migrate users without membership into the platform."""
    from src.db.permission_enums import RoleSlug
    from src.db.permissions import Role, UserRole

    # Get the database session
    settings = get_settings()
    engine: Engine = create_engine(
        settings.database_config.sql_connection_string,
        echo=False,
        pool_pre_ping=True,
    )

    db_session = Session(engine)

    print("=" * 80)
    print("Migrating users to platform")
    print("=" * 80)

    # Get the platform record
    platform = get_platform(db_session)

    if not platform:
        print("❌ Error: Platform not found")
        print("Please create the platform first using 'python cli.py install'")
        raise typer.Exit(code=1)

    print(f"✅ Found platform: {platform.name}")

    # Get the default 'user' role
    user_role = db_session.exec(select(Role).where(Role.slug == RoleSlug.USER)).first()

    if not user_role:
        print("❌ Error: Default 'user' role not found")
        print("Please run migrations first")
        raise typer.Exit(code=1)

    print(f"✅ Found user role: {user_role.name} (ID: {user_role.id})")

    # Get all users
    all_users = db_session.exec(select(User)).all()
    print(f"\n📊 Found {len(all_users)} total users in database")

    # Get users who already have roles
    users_with_roles = db_session.exec(select(UserRole.user_id).distinct()).all()
    user_ids_with_roles = {user_id for (user_id,) in users_with_roles}
    print(f"📊 {len(user_ids_with_roles)} users already have platform memberships")

    # Filter to users without any platform membership
    users_without_platform = [u for u in all_users if u.id not in user_ids_with_roles]
    print(
        f"📊 {len(users_without_platform)} users need to be migrated to the platform\n"
    )

    if not users_without_platform:
        print("✅ All users already have platform memberships. Nothing to do!")
        return

    # Add users to the platform
    migrated_count = 0
    skipped_count = 0

    for user in users_without_platform:
        try:
            # Create UserRole record
            new_user_role = UserRole(user_id=user.id, role_id=user_role.id)
            db_session.add(new_user_role)
            migrated_count += 1
            print(f"  ✅ Added user {user.username} (ID: {user.id}) to {platform.name}")
        except Exception as e:
            skipped_count += 1
            print(f"  ⚠️  Skipping user {user.username} (ID: {user.id}): {e!s}")

    # Commit changes
    db_session.commit()

    print("\n" + "=" * 80)
    print("Migration complete!")
    print("=" * 80)
    print(f"✅ Successfully migrated: {migrated_count} users")
    if skipped_count > 0:
        print(f"⚠️  Skipped: {skipped_count} users")
    print()


if __name__ == "__main__":
    cli()
