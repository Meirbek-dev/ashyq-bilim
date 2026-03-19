# Ashyq Bilim Backup Configuration

This document describes the automated backup system configured for the Ashyq Bilim platform using
[docker-volume-backup](https://github.com/offen/docker-volume-backup).

## Overview

The backup system automatically creates compressed archives of all critical data volumes on a
scheduled basis. Backups are stored locally and can optionally be uploaded to remote storage (S3,
Azure, Dropbox, etc.).

## What Gets Backed Up

The following Docker volumes are included in backups:

- **postgres_data** - PostgreSQL database
- **redis_data** - Redis cache and session data
- **chromadb_data** - ChromaDB vector database
- **app_content** - User uploads and organization data
- **app_logs** - Application logs

## Backup Schedule

- **Frequency**: Daily at 2:00 AM
- **Retention**: 7 days (automatically deletes older backups)
- **Compression**: Zstandard (zstd) - faster and more efficient than gzip
- **Format**: `backup-openu-YYYY-MM-DDTHH-MM-SS.tar.zst`

## Configuration

### Basic Setup

The backup service is configured in `docker-compose.yml`:

```yaml
backup:
  image: offen/docker-volume-backup:2.44.0
  restart: unless-stopped
  env_file:
    - ./extra/backup.env
  volumes:
    - postgres_data:/backup/postgres:ro
    - redis_data:/backup/redis:ro
    - chromadb_data:/backup/chromadb:ro
    - app_content:/backup/app_content:ro
    - app_logs:/backup/app_logs:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - ./backups:/archive
```

### Backup Settings

All backup settings are configured in `extra/backup.env`. Key settings include:

- `BACKUP_CRON_EXPRESSION` - When backups run (default: 2 AM daily)
- `BACKUP_RETENTION_DAYS` - How long to keep backups (default: 7 days)
- `BACKUP_COMPRESSION` - Compression method (default: zst for Zstandard)
- `BACKUP_ARCHIVE` - Local storage directory (default: /archive)

### Container Stopping During Backup

To ensure data consistency, the following containers are stopped during backup:

- PostgreSQL database (`db`)
- Redis cache (`redis`)
- ChromaDB vector database (`chromadb`)

These containers are automatically restarted after the backup completes.

## Local Backups

Backups are stored in the `./backups` directory on the host machine. This directory is automatically
created when you start the backup service.

### Accessing Backups

```bash
# List all backups
ls ./backups

# View the latest backup (symlink)
ls -lh ./backups/backup-openu-latest.tar.gz
```

**Note**: The symlink `backup-openu-latest.tar.gz` may have a `.tar.gz` extension even though it
points to a `.tar.zst` file. This is a known behavior of the backup tool. Always use the `--zstd`
flag when extracting or listing the contents of the backup.

## Restoring from Backup

### On Linux/macOS

#### 1. Stop the Application

```bash
docker compose down
```

#### 2. Extract the Backup

```bash
# Extract to a temporary directory (use the actual backup filename or the symlink)
mkdir temp-restore

# For zstd compressed backups (.tar.zst)
tar --zstd -xf ./backups/backup-openu-YYYY-MM-DDTHH-MM-SS.tar.zst -C temp-restore
# OR using the latest symlink
tar --zstd -xf ./backups/backup-openu-latest.tar.gz -C temp-restore

# For gzip compressed backups (.tar.gz) - if you change compression format
# tar -xzf ./backups/backup-openu-YYYY-MM-DDTHH-MM-SS.tar.gz -C temp-restore
```

#### 3. Restore Specific Volumes

```bash
# Restore PostgreSQL data
docker run --rm -v openu-dev_postgres_data:/data -v ${PWD}/temp-restore/backup/postgres:/backup alpine sh -c "cd /data && cp -a /backup/* ."

# Restore Redis data
docker run --rm -v openu-dev_redis_data:/data -v ${PWD}/temp-restore/backup/redis:/backup alpine sh -c "cd /data && cp -a /backup/* ."

# Restore ChromaDB data
docker run --rm -v openu-dev_chromadb_data:/data -v ${PWD}/temp-restore/backup/chromadb:/backup alpine sh -c "cd /data && cp -a /backup/* ."

# Restore app content
docker run --rm -v openu-dev_app_content:/data -v ${PWD}/temp-restore/backup/app_content:/backup alpine sh -c "cd /data && cp -a /backup/* ."

# Restore app logs
docker run --rm -v openu-dev_app_logs:/data -v ${PWD}/temp-restore/backup/app_logs:/backup alpine sh -c "cd /data && cp -a /backup/* ."
```

#### 4. Start the Application

```bash
docker compose up -d
```

#### 5. Clean Up

```bash
rm -rf temp-restore
```

---

### On Windows (PowerShell)

#### Prerequisites

1. **Docker Desktop** installed and running
2. **7-Zip** or **zstd** installed for extracting `.tar.zst` files
   - Option A: Install 7-Zip from <https://www.7-zip.org/>
   - Option B: Install zstd via `winget install -e --id Gyan.ZStd`

#### 1. Transfer the Backup File

Copy the backup file from the original machine to your new Windows machine:

```powershell
# Example: Copy to X:\ashyq-bilim\backups directory
# Place your backup-2026-01-23T02-00-00.tar.zst file in the backups folder
```

#### 2. Stop the Application

```powershell
# Navigate to project directory
cd X:\ashyq-bilim

# Stop all containers
docker compose down
```

#### 3. Extract the Backup Archive

> **⚠️ Important Note About Symbolic Links**
>
> PostgreSQL backups contain symbolic links in the data directory. When extracting with 7-Zip, you
> may see warnings like:
>
> `Skipping the potentially unsafe \backup\postgres\data -> . link`
>
> This is normal. You have two options:
>
> 1. **Enable symlink extraction in 7-Zip** (see Option A below) - Required for full restoration
> 2. **Use tar from Git Bash or WSL** (see Option D below) - Recommended, handles symlinks
>    automatically

**Option A: Using 7-Zip (GUI) - With Symlink Support**

1. Right-click on `backup-2026-01-23T02-00-00.tar.zst`
2. Select "7-Zip" → "Extract Here" (this extracts the .zst to .tar)
3. Right-click on the resulting `.tar` file
4. Select "7-Zip" → "Extract files..."
5. In the Extract dialog:
   - Set "Extract to:" as `temp-restore`
   - **Important:** Click the "..." button next to the path
   - In the options dialog, check **"Allow absolute paths in symbolic links"**
   - Click OK to extract

**Option B: Using 7-Zip (Command Line) - With Symlink Support**

```powershell
# Extract in two steps: first decompress zstd, then extract tar
& "C:\Program Files\7-Zip\7z.exe" x .\backups\backup-2026-01-23T02-00-00.tar.zst -o.\
& "C:\Program Files\7-Zip\7z.exe" x .\backup-2026-01-23T02-00-00.tar -o.\temp-restore -snl
# Note: -snl flag enables symbolic link support
```

**Option C: Using zstd CLI + PowerShell tar**

```powershell
# Install zstd if not already installed
winget install -e --id Gyan.ZStd

# Create extraction directory
New-Item -ItemType Directory -Force -Path temp-restore

# Extract the archive
zstd -d .\backups\backup-2026-01-23T02-00-00.tar.zst
tar -xf .\backups\backup-2026-01-23T02-00-00.tar -C temp-restore
```

**Option D: Using Git Bash or WSL (Recommended)**

If you have Git Bash or WSL installed, this is the simplest and most reliable method:

```bash
# In Git Bash or WSL terminal
mkdir -p temp-restore
tar --zstd -xf ./backups/backup-2026-01-23T02-00-00.tar.zst -C temp-restore
```

After extraction, you should have the following structure:

```bash
temp-restore/
  backup/
    postgres/
    redis/
    chromadb/
    app_content/
    app_logs/
    judge0_box/
```

#### 4. Identify Docker Volume Names

Docker volumes are prefixed with the project directory name. Check your volume names:

```powershell
# List all Docker volumes
docker volume ls

# Look for volumes like:
# ashyq-bilim_postgres_data
# ashyq-bilim_redis_data
# ashyq-bilim_chromadb_data
# ashyq-bilim_app_content
# ashyq-bilim_app_logs
# ashyq-bilim_judge0_box
```

Note the prefix (e.g., `ashyq-bilim_`) - you'll need this for the next step.

#### 5. Restore Each Volume

Replace `ashyq-bilim` with your actual volume prefix if different:

```powershell
# Get the current directory path
$backupPath = (Get-Location).Path + "\temp-restore\backup"

# Restore PostgreSQL data
docker run --rm `
  -v ashyq-bilim_postgres_data:/data `
  -v "${backupPath}\postgres:/backup" `
  alpine sh -c "cd /data && cp -a /backup/* ."

# Restore Redis data
docker run --rm `
  -v ashyq-bilim_redis_data:/data `
  -v "${backupPath}\redis:/backup" `
  alpine sh -c "cd /data && cp -a /backup/* ."

# Restore ChromaDB data
docker run --rm `
  -v ashyq-bilim_chromadb_data:/data `
  -v "${backupPath}\chromadb:/backup" `
  alpine sh -c "cd /data && cp -a /backup/* ."

# Restore app content (user uploads, org data)
docker run --rm `
  -v ashyq-bilim_app_content:/data `
  -v "${backupPath}\app_content:/backup" `
  alpine sh -c "cd /data && cp -a /backup/* ."

# Restore app logs
docker run --rm `
  -v ashyq-bilim_app_logs:/data `
  -v "${backupPath}\app_logs:/backup" `
  alpine sh -c "cd /data && cp -a /backup/* ."

# Restore Judge0 box (optional, if you have coding activities)
docker run --rm `
  -v ashyq-bilim_judge0_box:/data `
  -v "${backupPath}\judge0_box:/backup" `
  alpine sh -c "cd /data && cp -a /backup/* ."
```

#### 6. Start the Application

```powershell
docker compose up -d
```

#### 7. Verify the Restoration

```powershell
# Check container status
docker compose ps

# View logs to ensure everything started correctly
docker compose logs -f

# Test database connection
docker compose exec db psql -U openu -d openu -c "SELECT COUNT(*) FROM pg_tables;"
```

#### 8. Clean Up

```powershell
# Remove the extracted backup directory
Remove-Item -Recurse -Force temp-restore

# Optionally remove the extracted .tar file if you used 7-Zip
Remove-Item .\backups\backup-2026-01-23T02-00-00.tar -ErrorAction SilentlyContinue
```

### Troubleshooting Restoration on Windows

#### Volume Path Issues

If you get "invalid mount config" errors, ensure paths use forward slashes in Docker commands:

```powershell
# Convert Windows path to Docker-compatible format
$backupPath = (Get-Location).Path.Replace('\', '/') + "/temp-restore/backup"
```

#### Permission Denied

If restoration fails with permission errors, try running PowerShell as Administrator.

#### Empty Volumes After Restoration

Verify the backup structure:

```powershell
# List backup contents
Get-ChildItem -Recurse .\temp-restore\backup
```

Ensure each subdirectory (postgres, redis, etc.) contains files before attempting restoration.

#### Container Won't Start After Restoration

Check logs for specific errors:

```powershell
# View logs for a specific service
docker compose logs db
docker compose logs redis
```

Common issues:

- PostgreSQL version mismatch (backup from newer version than container)
- Corrupted data files (try restoring from an older backup)
- Insufficient disk space

## Manual Backup

To trigger a manual backup immediately:

```bash
docker compose exec backup backup
```

## Monitoring

### Check Backup Logs

```bash
# View live logs
docker compose logs -f backup

# View recent logs
docker compose logs --tail=100 backup
```

### Verify Backup Integrity

```bash
# List contents without extracting (for zstd compressed backups)
tar --zstd -tf ./backups/backup-openu-latest.tar.gz

# Or for the actual .tar.zst file
tar --zstd -tf ./backups/backup-openu-YYYY-MM-DDTHH-MM-SS.tar.zst
```

## Notifications (Optional)

Configure webhook notifications for backup success/failure by adding to `extra/backup.env`:

```env
# Slack
NOTIFICATION_URLS="slack://token@channel"

# Discord
NOTIFICATION_URLS="discord://token@channel"

# Multiple webhooks (comma-separated)
NOTIFICATION_URLS="slack://token@channel,discord://token@channel"
```

## Encryption (Optional)

### Symmetric Encryption (GPG)

```env
GPG_PASSPHRASE="your-secure-passphrase"
```

### Asymmetric Encryption (Age)

```env
AGE_PUBLIC_KEYS="age1xxxxxxxxxxxxx,age1yyyyyyyyyyyyy"
```

## Troubleshooting

### "gzip: stdin: not in gzip format" Error

If you see this error when trying to extract or list backup contents:

```bash
tar -tzf ./backups/backup-openu-latest.tar.gz
# gzip: stdin: not in gzip format
```

**Solution**: The backup is using zstd compression, not gzip. Use the `--zstd` flag:

```bash
# List contents
tar --zstd -tf ./backups/backup-openu-latest.tar.gz

# Extract backup
tar --zstd -xf ./backups/backup-openu-latest.tar.gz -C temp-restore
```

### Backup Not Running

1. Check if the backup container is running:

   ```bash
   docker compose ps backup
   ```

2. Check logs for errors:

   ```bash
   docker compose logs backup
   ```

### Out of Disk Space

Adjust retention period in `extra/backup.env`:

```env
BACKUP_RETENTION_DAYS="3"  # Keep fewer days
```

### Backup Takes Too Long

1. Increase compression parallelism:

   ```env
   GZIP_PARALLELISM="0"  # Use all CPU cores
   ```

2. Zstandard compression is already enabled (fastest option):

   ```env
   BACKUP_COMPRESSION="zst"  # Already using Zstandard
   ```

   If you need even faster backups at the cost of slightly larger files:

   ```env
   BACKUP_COMPRESSION="none"  # No compression, tar only
   ```

## Security Considerations

1. **Backup Directory Permissions**: Ensure `./backups` has appropriate permissions
2. **Encryption**: Enable encryption for sensitive data
3. **Remote Storage**: Use secure credentials and HTTPS endpoints
4. **Access Control**: Limit access to backup files and configuration

## Additional Resources

- [docker-volume-backup Documentation](https://github.com/offen/docker-volume-backup)
- [Cron Expression Reference](https://crontab.guru/)
- [GPG Encryption Guide](https://www.gnupg.org/gph/en/manual.html)
