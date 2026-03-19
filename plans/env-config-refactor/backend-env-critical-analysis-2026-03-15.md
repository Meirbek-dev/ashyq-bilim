# Backend Env Handling Critical Analysis And Refactor Plan

## Scope

This review covers the backend env and config system centered on:

- `apps/api/config/config.py`
- `apps/api/config/config.yaml`
- `apps/api/.env.example`
- `apps/api/src/db/strict_base_model.py`
- `apps/api/src/core/events/database.py`
- root `Dockerfile`
- `docker-compose.yml`
- `extra/example-conf.env`

It reflects the current codebase state on 2026-03-15, including the recent `pydantic-settings`
refactor that moved most direct env reads behind typed settings models.

## Executive Summary

The backend env system is better than it was before the recent refactor, but it is still more
complex than it needs to be and still has real operational risk.

The main issue is not field validation. The main issue is source ambiguity.

Today the backend can derive configuration from all of the following at once:

1. OS environment variables injected at runtime.
2. `extra/.env` through `docker-compose.yml`.
3. `apps/api/.env` through `load_dotenv(...)` and `SettingsConfigDict(env_file=...)`.
4. `apps/api/config/config.yaml` when `PLATFORM_DEVELOPMENT_MODE` is absent or truthy.

That means the system has more than one authoritative source of truth, and the precedence rules are
partly explicit, partly implicit, and partly spread across different modules.

The short version:

- Validation is decent.
- Source control is not.
- Deployment behavior is harder to reason about than it should be.
- There is still duplication in files, naming, loading, and caching.
- The current setup is especially fragile around Docker builds, local development, and secret
  handling.

## Current Backend Env Sources

## Active sources

| Source                               | Current role                 | Notes                                                          |
| ------------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| Runtime process env                  | Primary override source      | Correct place for production configuration.                    |
| `extra/.env`                         | Compose runtime source       | Used by the `app` container in `docker-compose.yml`.           |
| `apps/api/.env`                      | Backend-local dotenv source  | Loaded explicitly in code and also through Pydantic settings.  |
| `apps/api/config/config.yaml`        | Local-development fallback   | Enabled when `PLATFORM_DEVELOPMENT_MODE` is missing or truthy. |
| Raw `os.getenv` / `os.environ` reads | Special-case bootstrap logic | Still used for development-mode bootstrap and `TESTING`.       |

## Effective precedence

In practice the precedence is roughly:

1. Explicit init args.
2. Process env.
3. `apps/api/.env`.
4. File secrets source if added later.
5. YAML defaults when allowed.

The problem is that the backend also preloads `apps/api/.env` into process env with
`load_dotenv(...)`, so the separation between step 2 and step 3 is already blurred before Pydantic
runs.

## Critical Findings

### 1. There is no single authoritative runtime config source

This is the highest-level problem.

The backend container receives env vars from `extra/.env`, but backend code also hard-wires
`apps/api/.env` as a second dotenv source. That means Docker runtime config and backend-local config
can drift independently.

Consequences:

- Local Docker behavior can differ from local direct Python execution.
- A developer can update one env file and forget the other.
- Debugging precedence becomes non-obvious.
- “What config is the app actually using?” is harder to answer than it should be.

### 2. `apps/api/.env` is loaded redundantly

`apps/api/.env` is currently read in more than one way:

- `load_dotenv(ENV_FILE)` in `apps/api/config/config.py`
- `env_file=str(ENV_FILE)` in every `PlatformSectionSettings` subclass
- `load_dotenv(...)` again in `apps/api/src/db/strict_base_model.py`

This is redundant even if it happens to work.

Consequences:

- Extra hidden precedence.
- More startup-side effects at import time.
- Harder tests.
- More places to keep in sync when env behavior changes.

### 3. The root image can accidentally bake in backend-local `.env`

The root `Dockerfile` copies `./apps/api` into the image. The root `.dockerignore` excludes
`extra/.env`, but it does not exclude `apps/api/.env`.

That means a backend-local secret file can become part of the image build context and potentially
the final image, even though the runtime container is already getting env through `extra/.env`.

This is not just duplication. It is a secret-leak and drift risk.

### 4. YAML fallback is useful for dev, but it makes runtime resolution harder to reason about

`config.yaml` is acting as a local-development defaults source, gated by
`_should_load_yaml_defaults()` which itself depends on a raw env read of
`PLATFORM_DEVELOPMENT_MODE`.

This creates a bootstrap cycle:

- One env var is read manually to decide whether the rest of the typed config system should load
  YAML.
- That same env var also exists as a typed settings field inside `GeneralConfig`.

This is understandable, but still structurally awkward.

Consequences:

- Runtime behavior depends on pre-settings bootstrap logic.
- The “dev mode” toggle affects both app behavior and source selection.
- The source graph is harder to document and test.

### 5. Configuration is split across multiple mini-settings objects instead of one cohesive settings tree

Current accessors:

- `get_platform_config()`
- `get_internal_config()`
- `get_bootstrap_config()`
- `get_judge0_config()`

This is better than raw env reads, but still fragments ownership.

Consequences:

- Multiple caches for one conceptual config system.
- Some env vars live under the main settings tree, others do not.
- The caller has to know which accessor owns which setting.
- Documentation becomes less cohesive.

### 6. Some config is snapshotted at import time, which weakens the value of cache reload hooks

Examples:

- `apps/api/app.py` stores `platform_config = get_platform_config()` at module import time.
- `apps/api/src/security/security.py` stores
  `SECRET_KEY = get_platform_config().security_config.auth_jwt_secret_key` at module import time.

Once this happens, `reload_platform_config_cache()` does not fully represent a config reload
anymore.

Consequences:

- Runtime reload semantics are partial, not real.
- Tests may pass or fail depending on import order.
- Config changes after import can be ignored silently.

### 7. Naming is still inconsistent in ways that add cognitive load

Examples:

- `CHROMADB_PERSIST_PATH` does not follow the `PLATFORM_*` convention.
- `cookie_config` and `cookies_config` both exist via aliasing.
- `separate_db_enabled` carries legacy compatibility with previous names. Remove legacy
- `contact_email` lives outside the main nested sections.
- Judge0, bootstrap admin values, and cloud internal auth each use different access patterns.

This is survivable, but it adds friction and migration overhead.

### 8. Documentation is duplicated across too many env examples

Backend-related env documentation currently exists in at least these places:

- `apps/api/.env.example`
- `extra/example-conf.env`
- `apps/api/config/config.yaml`

Each has a slightly different audience and format, but they overlap heavily.

Consequences:

- Changes are easy to miss.
- Example values drift.
- Required vs optional semantics can diverge.

### 9. Test-mode config is still outside the main settings model

`TESTING=true` is still read directly in `apps/api/src/core/events/database.py`.

This is one of the remaining intentional raw env reads, but it still means test behavior is governed
outside the typed config system.

Consequences:

- Test mode is special-case behavior rather than modeled behavior.
- It increases the number of “magic env vars” a maintainer has to remember.

### 10. Secret-bearing env files exist in multiple locations

The workspace currently contains multiple secret-bearing env files for backend-related
configuration, including runtime and backup-style variants.

Consequences:

- More leak surface.
- More drift surface.
- More chances to accidentally use stale credentials.

Even if these files are ignored by Git, they still represent operational sprawl.

## What Is Already Good

The current state is not all bad. These are worth keeping:

- Typed validation for PostgreSQL and Redis DSNs.
- Empty-string normalization for optional secrets.
- Cookie domain normalization.
- Security guard that rejects insecure JWT secrets outside dev mode.
- Migration away from many direct env reads.
- Explicit example env file for deployment.

The plan below preserves those gains and removes the remaining structural complexity.

## Recommended Target State

## Preferred design

Use one runtime configuration path for the backend:

1. Process environment is the only production runtime source.
2. Optional dotenv loading is development-only and explicit.
3. YAML is not part of normal runtime resolution.
4. All backend settings are exposed through one top-level settings object.
5. No module should snapshot config at import time unless it is truly immutable for the process
   lifetime.

## Practical target rules

- Production and Docker: env only.
- Local non-Docker development: one explicit local env file, not two.
- Examples/docs: one authoritative backend env reference, other files point to it.
- Secrets: never copied into images, never duplicated in backup env files kept near app code.

## Simplification Recommendation

If the goal is maximum simplification, the best path is:

### Recommended simplification

Remove YAML from runtime config resolution entirely.

Keep `config.yaml` only if it becomes one of these:

- documentation-only,
- a deprecated migration artifact, or
- an explicitly selected local dev preset loaded by a dedicated dev script.

Do not keep it as an automatic fallback inside the default runtime settings path.

Why:

- It removes a whole config source.
- It eliminates the `PLATFORM_DEVELOPMENT_MODE` bootstrap paradox.
- It makes config precedence obvious.
- It aligns Docker, local Python, CI, and production more closely.

If removing YAML now is too disruptive, keep it temporarily but require an explicit opt-in flag or
explicit dev entrypoint instead of loading it automatically.

## Concrete Plan

### Phase 0: Immediate risk reduction

1. Stop baking backend-local env files into images.
2. Add `apps/api/.env` and `**/.env` exceptions as appropriate to the root `.dockerignore`.
3. Audit whether any secret-bearing env backup files should be removed from the workspace or
   relocated outside the repo tree.
4. Treat `apps/api/.env` as local-only and never as a deploy-time source.

Success criteria:

- The built backend image contains no local env file.
- Docker runtime behavior depends only on runtime env injection.

### Phase 1: Collapse env loading to one mechanism

1. Remove `load_dotenv(ENV_FILE)` from `apps/api/config/config.py`.
2. Remove `load_dotenv(...)` from `apps/api/src/db/strict_base_model.py`.
3. Decide on one local-dev loading strategy:
   - either Pydantic `env_file`,
   - or an explicit dev launcher that exports env before starting the app.
4. Do not use both.

Recommendation:

- Keep dotenv support in one place only.
- Prefer explicit app bootstrap over import-time dotenv side effects.

Success criteria:

- `.env` is parsed once.
- Importing backend modules no longer mutates process env as a side effect.

### Make runtime sources unambiguous (KEEP AS IS. DON'T TOUCH IT. TOO DANGEROUS)

### Phase 3: Replace fragmented accessors with one settings tree

1. Introduce one `AppSettings` root model.
2. Move internal, bootstrap, and Judge0 config under that tree, for example:
   - `settings.internal.cloud_key`
   - `settings.bootstrap.initial_admin_email`
   - `settings.integrations.judge0.base_url`
3. Keep `get_settings()` as the single public accessor.
4. Remove compatibility wrappers temporarily if needed.

This removes conceptual duplication.

Success criteria:

- New code never asks “which config getter should I use?”

### Phase 4: Remove import-time config snapshots

1. Replace module-level config constants with lazy accessors or dependency injection.
2. In particular, stop freezing JWT secret and app config at import time.
3. Where repeated lookup is a concern, cache the settings object centrally rather than caching
   individual derived constants across modules.

Success criteria:

- `reload_platform_config_cache()` either becomes meaningful end-to-end or is removed.
- Tests do not depend on import order for config correctness.

### Phase 5: Normalize naming and remove legacy aliases

1. Standardize env names under one convention.
2. Recommended rule: all backend env vars use `PLATFORM_` or a replacement global prefix chosen
   once.
3. Rename outliers over a migration window:
   - `CHROMADB_PERSIST_PATH` -> `PLATFORM_CHROMADB_PERSIST_PATH`
4. Remove temporary compatibility aliases after migration:
   - `cookies_config`
   - legacy Chroma field names
5. Keep naming flat if you want low churn, or move to nested env names if you want cleaner long-term
   structure.

Recommended approach:

- Long term: nested env naming, the team is willing to take a breaking config migration.

### Phase 6: Simplify docs and examples (KEEP AS IS. DON'T TOUCH IT. TOO DANGEROUS)

### Phase 7: Decide what to do with YAML

#### Remove YAML from runtime completely

Best for simplicity.

- Delete YAML from `settings_customise_sources(...)`.
- Move any remaining local defaults into a dev-only env file.
- Keep `config.yaml` only as historical documentation until fully removed.

Recommendation: Option A.

## Redundant Code And Vars To Remove

## Code to remove or reduce

- Duplicate `load_dotenv(...)` calls.
- Multiple config accessors for one config domain.
- Import-time cached config constants.
- Automatic YAML fallback in normal runtime resolution.
- Legacy aliases kept only for backward compatibility once the migration window ends.

## Vars and files to simplify

- Remove or rename `CHROMADB_PERSIST_PATH` to follow the backend prefix convention.
- Eliminate duplicate backend env examples where possible.
- Remove stale env backup files from the repo tree or move them to secure operator-only storage.

## Suggested End State For Files

### Keep

- `extra/example-conf.env` as the main deployment example.
- one backend settings module.
- one local-dev env file convention.

### Remove or deprecate

- automatic runtime use of `apps/api/config/config.yaml`
- duplicate backend-local `.env` auto-loading
- overlapping example env files with the same variables

## Migration Notes

To reduce rollout risk, do this in order:

1. Fix Docker/image leakage first.
2. Remove duplicate dotenv loading second.
3. Consolidate accessor API third.
4. Remove YAML fallback last.

That order gives the biggest safety improvement earliest, without forcing a large config migration
on day one.

## Final Recommendation

The backend env system should be simplified around one principle:

> Production config should come from env, development config should be explicit, and there should be
> exactly one default runtime resolution path.

The current system is close enough that this can be done incrementally. The immediate priorities
are:

1. stop local `.env` files from entering images,
2. stop loading the same dotenv file in multiple places,
3. reduce the config API to one settings object,
4. remove automatic YAML fallback from the normal runtime path.

If those four changes are made, most of the remaining duplication and ambiguity disappears
naturally.
