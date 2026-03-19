# Applying API Migrations On A Dockerized Server

This project runs database migrations with Alembic from the `app` service image. The API startup
checks `alembic_version` and will fail if migrations have not been applied, so run migrations before
starting or restarting the API container. In production, the container starts in `/app`, while the
API project lives in `/app/api`, so migration commands must set the working directory explicitly.

The migration container gets its backend settings from the `app` service environment, which in this
repository is normally `extra/.env` via `docker-compose.yml`. There is no runtime fallback to
`apps/api/config/config.yaml` or `apps/api/.env`.

## When To Use Which Command

- Use `docker compose exec app ...` when the `app` container is already running.
- Use `docker compose run --rm app ...` when the `app` container is not running yet.

From the `docker compose ps -a` output you shared, `db` is running but `app` is not listed, so use
the `run --rm` flow below.

## 1. Connect To The Server

SSH into the server and go to the repository root where `docker-compose.yml` is located.

```bash
cd /path/to/ashyq-bilim
docker compose ps -a
```

## 2. Confirm The Database Is Healthy

Before running migrations, make sure the PostgreSQL container is up and healthy.

```bash
docker compose ps db
```

Expected state: `Up` and `(healthy)`.

## 3. Apply The Latest Migration

### Apply when `app` is not running

Run Alembic in a one-off container based on the `app` service:

```bash
docker compose run --rm -w /app/api app uv run --no-sync alembic upgrade head
```

### Apply when `app` is already running

Run the same migration command inside the running container:

```bash
docker compose exec -w /app/api app uv run --no-sync alembic upgrade head
```

## 4. Verify The Current Revision

After the migration completes, confirm the database is at the expected head revision.

### If `app` is not running

```bash
docker compose run --rm -w /app/api app uv run --no-sync alembic current
```

### If `app` is already running

```bash
docker compose exec -w /app/api app uv run --no-sync alembic current
```

If you want to see the available latest revision from the code, run:

```bash
docker compose run --rm -w /app/api app uv run --no-sync alembic heads
```

`current` should match `heads` after a successful upgrade.

## 5. Start Or Restart The API Service

If the API container is not running yet:

```bash
docker compose up -d app
```

If the API container is already running and you want to restart it cleanly after migration:

```bash
docker compose restart app
```

## 6. Check Logs

Confirm the service starts without migration health check errors.

```bash
docker compose logs -f app
```

You should not see errors like:

- `Database migration health check failed. Run Alembic migrations before starting the API service.`
- `No Alembic version found. Run Alembic migrations before starting the API service.`

## Recommended Safe Sequence For Production

If you are applying migrations on a live server, use this order:

1. Take a database backup.
2. Confirm `db` is healthy.
3. Run `docker compose run --rm -w /app/api app uv run --no-sync alembic upgrade head`.
4. Verify with `docker compose run --rm -w /app/api app uv run --no-sync alembic current`.
5. Start or restart `app`.
6. Check `docker compose logs -f app`.

## Quick Copy/Paste

For the current server state you shared, this is the direct command sequence:

```bash
cd /path/to/ashyq-bilim
docker compose ps db
docker compose run --rm -w /app/api app uv run --no-sync alembic upgrade head
docker compose run --rm -w /app/api app uv run --no-sync alembic current
docker compose up -d app
docker compose logs --tail=100 app
```

## Troubleshooting

If you see this error:

```text
warning: `--no-sync` has no effect when used outside of a project
FAILED: No 'script_location' key found in configuration.
```

you ran the command from the wrong directory inside the container. Re-run it with `-w /app/api`.
