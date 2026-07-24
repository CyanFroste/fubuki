$root = Resolve-Path "$PSScriptRoot/.."
$binPath = "$root/bin"
$originalPath = Get-Location
$targetTuple = rustc --print host-tuple

Write-Host "🚀 Starting build process..."
Write-Host "==> Building app..."
Set-Location "$root/app"
cargo build --release

Write-Host "==> Cleaning and creating bin directory..."
Remove-Item -Recurse -Force $binPath -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $binPath | Out-Null

Write-Host "==> Building client..."
Set-Location "$root/client"
pnpm build

Write-Host "==> Moving binaries to bin folder..."
Copy-Item "$root/app/target/release/fubuki.exe" "$binPath/fubuki-$targetTuple.exe"
Move-Item "$root/app/target/release/fubuki.exe" "$binPath/fubuki.exe"

# build launcher (optional)
$launcherPath = "$root/launcher"
$backendPath = "$launcherPath/backend"
$cargoTomlPath = Join-Path $backendPath "Cargo.toml"

Write-Host "==> Building launcher..."
Set-Location $launcherPath
pnpm build

# Read name and version from Cargo.toml
$nameLine = Select-String -Path $cargoTomlPath -Pattern '^\s*name\s*=\s*".+"'
$versionLine = Select-String -Path $cargoTomlPath -Pattern '^\s*version\s*=\s*".+"'

if ($nameLine -match '"([^"]+)"') {
    $appName = $Matches[1]
}
else {
    Write-Error "Package name not found in Cargo.toml"
    exit 1
}

if ($versionLine -match '"([^"]+)"') {
    $version = $Matches[1]
}
else {
    Write-Error "Version not found in Cargo.toml"
    exit 1
}

# Paths
$installer = Join-Path $backendPath "target/release/bundle/nsis/${appName}_${version}_x64-setup.exe"
$compiledBinary = Join-Path $backendPath "target/release/$appName.exe"
$portableBinary = Join-Path $binPath "${appName}_$version.exe"

# Ensure output directories
New-Item -ItemType Directory -Force -Path $binPath | Out-Null

# Copy compiled binary
Copy-Item -Force -Path $compiledBinary -Destination $portableBinary 

# Copy installer if it exists
if (Test-Path $installer) {
    Copy-Item -Force -Path $installer -Destination $binPath
}
else {
    Write-Warning "Installer not found: $installer"
}

Write-Host "==> Returning to original path..."
Set-Location "$originalPath"

Write-Host "✅ Build process complete."
Get-ChildItem $binPath


