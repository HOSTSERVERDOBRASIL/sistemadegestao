param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath,

  [int]$BlackThreshold = 3,
  [int]$Padding = 8
)

Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($InputPath)

try {
  $minX = $source.Width
  $minY = $source.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $source.Height; $y++) {
    for ($x = 0; $x -lt $source.Width; $x++) {
      $pixel = $source.GetPixel($x, $y)
      if ($pixel.R -gt $BlackThreshold -or $pixel.G -gt $BlackThreshold -or $pixel.B -gt $BlackThreshold) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0 -or $maxY -lt 0) {
    throw "No non-black pixels were found in '$InputPath'."
  }

  $left = [Math]::Max(0, $minX - $Padding)
  $top = [Math]::Max(0, $minY - $Padding)
  $right = [Math]::Min($source.Width - 1, $maxX + $Padding)
  $bottom = [Math]::Min($source.Height - 1, $maxY + $Padding)

  $output = New-Object System.Drawing.Bitmap(($right - $left + 1), ($bottom - $top + 1), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  try {
    for ($y = $top; $y -le $bottom; $y++) {
      for ($x = $left; $x -le $right; $x++) {
        $pixel = $source.GetPixel($x, $y)
        $alpha = if ($pixel.R -le $BlackThreshold -and $pixel.G -le $BlackThreshold -and $pixel.B -le $BlackThreshold) { 0 } else { 255 }
        $output.SetPixel($x - $left, $y - $top, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
      }
    }

    $destination = [System.IO.Path]::GetFullPath($OutputPath)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination)) | Out-Null
    $output.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $output.Dispose()
  }
}
finally {
  $source.Dispose()
}
