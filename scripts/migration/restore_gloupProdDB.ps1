# Restore local Docker MySQL gloupProdDB from sql_backup/gloupProdDB_backup.sql
# Usage (from repo root): .\scripts\migration\restore_gloupProdDB.ps1

$ErrorActionPreference = "Stop"

function Invoke-DockerMysql {
    param([string]$Sql)
    docker exec $Container mysql -uroot -p"$RootPassword" -e $Sql 2>&1 | Out-Null
}

$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$BackupFile = Join-Path $RepoRoot "sql_backup\gloupProdDB_backup.sql"
$Container = "gloup-test-backend-db-1"
$RootPassword = "Gloup#123"
$Database = "gloupProdDB"

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup not found: $BackupFile"
}

Write-Host "Ensuring MySQL container is running..."
Push-Location $RepoRoot
docker compose up -d db | Out-Null
Pop-Location

$healthy = $false
for ($i = 0; $i -lt 45; $i++) {
    $status = docker inspect --format='{{.State.Health.Status}}' $Container 2>$null
    if ($status -eq "healthy") { $healthy = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $healthy) {
    Write-Error "MySQL container did not become healthy in time."
}

Write-Host "Recreating database $Database..."
Invoke-DockerMysql "DROP DATABASE IF EXISTS $Database; CREATE DATABASE $Database CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"

Write-Host "Copying backup into container..."
docker cp $BackupFile "${Container}:/tmp/gloupProdDB_backup.sql"

Write-Host "Importing backup (this may take several minutes)..."
docker exec $Container bash -c @"
set -e
sed '/^SET @@GLOBAL.GTID_PURGED=/d' /tmp/gloupProdDB_backup.sql > /tmp/gloupProdDB_restore.sql
mysql -uroot -p'$RootPassword' '$Database' < /tmp/gloupProdDB_restore.sql
rm -f /tmp/gloupProdDB_backup.sql /tmp/gloupProdDB_restore.sql
"@

Write-Host "Verifying..."
docker exec $Container mysql -uroot -p"$RootPassword" -N -e "SELECT 'tables', COUNT(*) FROM information_schema.tables WHERE table_schema='$Database'; SELECT 'User', COUNT(*) FROM ${Database}.User; SELECT 'Store', COUNT(*) FROM ${Database}.Store; SELECT 'appointments', COUNT(*) FROM ${Database}.appointments; SELECT 'NotificationLogs', COUNT(*) FROM ${Database}.NotificationLogs;" 2>&1 | Where-Object { $_ -notmatch 'insecure' }

Write-Host "Done. gloupProdDB restored from sql_backup/gloupProdDB_backup.sql"
