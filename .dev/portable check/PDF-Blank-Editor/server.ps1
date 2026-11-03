param([int]$Port = 8765, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'web'))
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$csp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
$types = @{'.html'='text/html; charset=utf-8';'.css'='text/css';'.mjs'='text/javascript';'.js'='text/javascript';'.wasm'='application/wasm';'.bcmap'='application/octet-stream';'.pfb'='application/octet-stream';'.ttf'='font/ttf';'.txt'='text/plain'}
try { $listener.Start() } catch { Write-Host "Cannot start on port $Port. Close the other instance or choose -Port 8766."; exit 1 }
Write-Host "PDF Blank Editor: http://127.0.0.1:$Port/"
Write-Host 'Keep this window open. Close it or press Ctrl+C to stop.'
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/" }
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $client.ReceiveTimeout = 3000; $client.SendTimeout = 10000
      $stream = $client.GetStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $line = $reader.ReadLine()
      if (-not $line -or $line.Length -gt 8192) { continue }
      $parts = $line.Split(' ')
      if ($parts.Length -ne 3) { continue }
      $method = $parts[0]; $target = $parts[1]; $headers = @{}; $size = 0
      while ($null -ne ($line = $reader.ReadLine()) -and $line -ne '') {
        $size += $line.Length
        if ($size -gt 16384) { throw 'Headers too large' }
        $colon = $line.IndexOf(':')
        if ($colon -gt 0) { $headers[$line.Substring(0,$colon).ToLowerInvariant()] = $line.Substring($colon+1).Trim() }
      }
      $status = 200; $reason = 'OK'; $mime = 'text/plain'; $bytes = [byte[]]@()
      if ($headers['host'] -ne "127.0.0.1:$Port") { $status=403; $reason='Forbidden' }
      elseif ($method -notin @('GET','HEAD')) { $status=405; $reason='Method Not Allowed' }
      else {
        $path = [Uri]::UnescapeDataString(($target -split '\?')[0])
        if (-not $path.StartsWith('/') -or $path.Contains('\') -or $path.Contains(':') -or $path.Contains([char]0) -or ($path.Split('/') -contains '..')) {
          $status=403; $reason='Forbidden'
        } else {
          if ($path -eq '/') { $path='/index.html' }
          $full = [IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
          if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { $status=403; $reason='Forbidden' }
          elseif (-not [IO.File]::Exists($full)) { $status=404; $reason='Not Found' }
          else {
            $extension = [IO.Path]::GetExtension($full).ToLowerInvariant()
            if ($types.ContainsKey($extension)) { $mime=$types[$extension] } else { $mime='application/octet-stream' }
            $bytes=[IO.File]::ReadAllBytes($full)
          }
        }
      }
      if ($status -ne 200) { $bytes=[Text.Encoding]::UTF8.GetBytes($reason) }
      $response = "HTTP/1.1 $status $reason`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`nCache-Control: no-store`r`nX-Content-Type-Options: nosniff`r`nReferrer-Policy: no-referrer`r`nCross-Origin-Resource-Policy: same-origin`r`nContent-Security-Policy: $csp`r`n`r`n"
      $head=[Text.Encoding]::ASCII.GetBytes($response)
      $stream.Write($head,0,$head.Length)
      if ($method -ne 'HEAD') { $stream.Write($bytes,0,$bytes.Length) }
      $stream.Flush()
    } catch { Write-Verbose $_ } finally { $client.Close() }
  }
} finally { $listener.Stop() }
