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

Write-Host "==> Returning to original path..."
Set-Location "$originalPath"

Write-Host "✅ Build process complete."
