$ErrorActionPreference = 'Stop'

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this setup in an elevated PowerShell window.'
    }
}

function Convert-SecureStringToPlainText {
    param([Security.SecureString]$Value)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Read-ConfirmedPassword {
    param([string]$Label)

    while ($true) {
        $first = Read-Host "$Label (minimum 16 characters)" -AsSecureString
        $second = Read-Host "Confirm $Label" -AsSecureString
        $firstText = Convert-SecureStringToPlainText $first
        $secondText = Convert-SecureStringToPlainText $second

        if ($firstText.Length -lt 16) {
            Write-Host 'Use at least 16 characters.'
            continue
        }
        if ($firstText -cne $secondText) {
            Write-Host 'The entries did not match. Try again.'
            continue
        }

        return $firstText
    }
}

function Protect-LocalFile {
    param([string]$Path)

    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $Path '/inheritance:r' '/grant:r' `
        "*${currentSid}:(F)" '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not restrict access to a temporary or local configuration file.'
    }
}

function Invoke-PostgresCommand {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [string]$FailureMessage
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

$postgresBin = 'C:\Program Files\PostgreSQL\18\bin'
$initdb = Join-Path $postgresBin 'initdb.exe'
$pgCtl = Join-Path $postgresBin 'pg_ctl.exe'
$psql = Join-Path $postgresBin 'psql.exe'
$postgres = Join-Path $postgresBin 'postgres.exe'
$repoRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $repoRoot '.venv\Scripts\python.exe'
$backendPath = Join-Path $repoRoot 'backend'
$dataParent = Join-Path $env:LOCALAPPDATA 'TeamSync\PostgreSQL\18'
$dataDirectory = Join-Path $dataParent 'data'
$environmentPath = Join-Path $env:LOCALAPPDATA 'TeamSync\development.env'
$serviceName = 'TeamSyncPostgreSQL18'
$temporaryFiles = @()
$postgresPassword = $null
$applicationPassword = $null

try {
    Assert-Administrator

    foreach ($executable in @($initdb, $pgCtl, $psql, $postgres)) {
        if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
            throw "Required PostgreSQL 18 binary is missing: $executable"
        }
    }
    $version = (& $postgres --version | Out-String).Trim()
    if ($version -notmatch 'PostgreSQL\) 18\.6(?:\s|$)') {
        throw "Expected PostgreSQL 18.6 binaries; found: $version"
    }

    $services = Get-CimInstance Win32_Service | Where-Object {
        $_.Name -match 'postgres|pgsql' -or $_.PathName -match 'postgres'
    }
    if ($services) {
        throw 'A PostgreSQL service already exists. Review it before creating another cluster.'
    }

    $candidateDirectories = @()
    foreach ($pattern in @(
        'C:\Program Files\PostgreSQL\*\data',
        'C:\ProgramData\PostgreSQL\*\data',
        "$env:LOCALAPPDATA\PostgreSQL\*\data",
        "$env:APPDATA\PostgreSQL\*\data"
    )) {
        $candidateDirectories += Get-Item -Path $pattern -ErrorAction SilentlyContinue
    }
    if ($env:PGDATA -and (Test-Path -LiteralPath $env:PGDATA)) {
        $candidateDirectories += Get-Item -LiteralPath $env:PGDATA
    }
    foreach ($directory in $candidateDirectories | Sort-Object -Property FullName -Unique) {
        if ((Get-ChildItem -LiteralPath $directory.FullName -Force -ErrorAction Stop | Measure-Object).Count -gt 0) {
            throw "PostgreSQL data already exists at $($directory.FullName). No files were changed."
        }
    }

    if (Test-Path -LiteralPath $dataDirectory) {
        throw "The target data path already exists; refusing to overwrite it: $dataDirectory"
    }
    if (Test-Path -LiteralPath $environmentPath) {
        throw "A local environment file already exists; refusing to overwrite it: $environmentPath"
    }
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        throw 'The repository Python environment is missing. Create .venv and install backend requirements first.'
    }

    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), 5432)
    try {
        $listener.Start()
    }
    catch {
        throw 'Port 5432 is not available on 127.0.0.1. No cluster was initialized.'
    }
    finally {
        $listener.Stop()
    }

    if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
        throw "The service name $serviceName is already in use."
    }

    Write-Host 'Passwords are entered in this local console and are not echoed or logged.'
    $postgresPassword = Read-ConfirmedPassword 'PostgreSQL postgres superuser password'
    $applicationPassword = Read-ConfirmedPassword 'TeamSync database user password'

    New-Item -ItemType Directory -Path $dataParent -Force | Out-Null
    New-Item -ItemType Directory -Path $dataDirectory -Force:$false | Out-Null

    $passwordFile = Join-Path $dataParent ("initdb-{0}.tmp" -f [Guid]::NewGuid())
    $temporaryFiles += $passwordFile
    [IO.File]::WriteAllText($passwordFile, '', [Text.UTF8Encoding]::new($false))
    Protect-LocalFile $passwordFile
    [IO.File]::WriteAllText($passwordFile, $postgresPassword, [Text.UTF8Encoding]::new($false))

    Invoke-PostgresCommand $initdb @(
        '--username=postgres',
        '--auth-local=scram-sha-256',
        '--auth-host=scram-sha-256',
        '--encoding=UTF8',
        "--pwfile=$passwordFile",
        "--pgdata=$dataDirectory"
    ) 'PostgreSQL cluster initialization failed.'

    Remove-Item -LiteralPath $passwordFile -Force
    $temporaryFiles = @($temporaryFiles | Where-Object { $_ -ne $passwordFile })

    [IO.File]::AppendAllText(
        (Join-Path $dataDirectory 'postgresql.conf'),
        "`r`nlisten_addresses = '127.0.0.1'`r`nport = 5432`r`npassword_encryption = 'scram-sha-256'`r`n",
        [Text.UTF8Encoding]::new($false)
    )
    [IO.File]::WriteAllText(
        (Join-Path $dataDirectory 'pg_hba.conf'),
        "# TYPE  DATABASE  USER  ADDRESS          METHOD`r`nhost    all       all   127.0.0.1/32   scram-sha-256`r`nhost    all       all   0.0.0.0/0      reject`r`nhost    all       all   ::/0           reject`r`n",
        [Text.UTF8Encoding]::new($false)
    )

    Invoke-PostgresCommand $pgCtl @(
        'register',
        '-D', $dataDirectory,
        '-N', $serviceName,
        '-S', 'auto'
    ) 'Registering the PostgreSQL Windows service failed.'
    Start-Service -Name $serviceName

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & (Join-Path $postgresBin 'pg_isready.exe') -h 127.0.0.1 -p 5432 -U postgres -d postgres | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        throw 'The PostgreSQL service did not become ready on 127.0.0.1:5432.'
    }

    $environmentDirectory = Split-Path -Parent $environmentPath
    if (-not (Test-Path -LiteralPath $environmentDirectory)) {
        New-Item -ItemType Directory -Path $environmentDirectory -Force:$false | Out-Null
    }

    $sqlPath = Join-Path $environmentDirectory ("database-setup-{0}.sql" -f [Guid]::NewGuid())
    $temporaryFiles += $sqlPath
    [IO.File]::WriteAllText($sqlPath, '', [Text.UTF8Encoding]::new($false))
    Protect-LocalFile $sqlPath
    $escapedPassword = $applicationPassword.Replace("'", "''")
    $sql = "CREATE ROLE teamsync LOGIN PASSWORD '$escapedPassword';`r`nCREATE DATABASE teamsync OWNER teamsync;`r`n"
    [IO.File]::WriteAllText($sqlPath, $sql, [Text.UTF8Encoding]::new($false))

    $env:PGPASSWORD = $postgresPassword
    try {
        Invoke-PostgresCommand $psql @(
            '--no-password',
            '--host=127.0.0.1',
            '--port=5432',
            '--username=postgres',
            '--dbname=postgres',
            '--set=ON_ERROR_STOP=1',
            "--file=$sqlPath"
        ) 'Creating the TeamSync database or role failed.'
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $sqlPath -Force
    $temporaryFiles = @($temporaryFiles | Where-Object { $_ -ne $sqlPath })

    $env:PGPASSWORD = $applicationPassword
    try {
        Invoke-PostgresCommand $psql @(
            '--no-password',
            '--host=127.0.0.1',
            '--port=5432',
            '--username=teamsync',
            '--dbname=teamsync',
            '--command=SELECT current_database(), current_user'
        ) 'The TeamSync PostgreSQL connection check failed.'
    }
    finally {
        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }

    $secretBytes = New-Object byte[] 48
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $randomGenerator.GetBytes($secretBytes)
    }
    finally {
        $randomGenerator.Dispose()
    }
    $djangoSecret = [Convert]::ToBase64String($secretBytes)
    [Array]::Clear($secretBytes, 0, $secretBytes.Length)

    $encodedPassword = [Uri]::EscapeDataString($applicationPassword)
    $environmentContents = @(
        "DJANGO_SECRET_KEY=$djangoSecret",
        'DJANGO_DEBUG=True',
        'DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1',
        "DATABASE_URL=postgres://teamsync:$encodedPassword@127.0.0.1:5432/teamsync",
        'CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173',
        'VITE_API_BASE_URL=/api'
    ) -join "`r`n"
    [IO.File]::WriteAllText($environmentPath, '', [Text.UTF8Encoding]::new($false))
    Protect-LocalFile $environmentPath
    [IO.File]::WriteAllText($environmentPath, "$environmentContents`r`n", [Text.UTF8Encoding]::new($false))
    [Environment]::SetEnvironmentVariable('TEAMSYNC_ENV_FILE', $environmentPath, 'User')
    $env:TEAMSYNC_ENV_FILE = $environmentPath

    Push-Location $backendPath
    try {
        Invoke-PostgresCommand $python @('manage.py', 'check') 'Django system checks failed.'
        Invoke-PostgresCommand $python @('manage.py', 'migrate', '--noinput') 'Django migrations failed.'
        Invoke-PostgresCommand $python @('manage.py', 'test', 'apps.core') 'Backend health endpoint tests failed.'
    }
    finally {
        Pop-Location
    }

    Write-Host "PostgreSQL service $serviceName is running with automatic startup."
    Write-Host 'PostgreSQL listens only on 127.0.0.1:5432 with SCRAM-SHA-256 authentication.'
    Write-Host "Django environment stored outside the repository at $environmentPath."
    Write-Host 'Django checks, migrations, and core endpoint tests completed.'
}
finally {
    foreach ($file in $temporaryFiles) {
        Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
