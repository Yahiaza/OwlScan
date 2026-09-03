Add-Type -AssemblyName System.Drawing

$outputDirectory = Join-Path $PSScriptRoot '..\build'
$outputPath = Join-Path $outputDirectory 'icon.png'
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$bitmap = [System.Drawing.Bitmap]::new(512, 512)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$shape = [System.Drawing.Drawing2D.GraphicsPath]::new()
$shape.AddArc(24, 24, 112, 112, 180, 90)
$shape.AddArc(376, 24, 112, 112, 270, 90)
$shape.AddArc(376, 376, 112, 112, 0, 90)
$shape.AddArc(24, 376, 112, 112, 90, 90)
$shape.CloseFigure()

$gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Point]::new(70, 50),
  [System.Drawing.Point]::new(442, 462),
  [System.Drawing.Color]::FromArgb(255, 82, 102, 222),
  [System.Drawing.Color]::FromArgb(255, 119, 72, 198)
)
$graphics.FillPath($gradient, $shape)

$whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 30)
$whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$graphics.DrawLine($whitePen, 140, 205, 140, 145)
$graphics.DrawLine($whitePen, 140, 145, 200, 145)
$graphics.DrawLine($whitePen, 312, 145, 372, 145)
$graphics.DrawLine($whitePen, 372, 145, 372, 205)
$graphics.DrawLine($whitePen, 140, 307, 140, 367)
$graphics.DrawLine($whitePen, 140, 367, 200, 367)
$graphics.DrawLine($whitePen, 312, 367, 372, 367)
$graphics.DrawLine($whitePen, 372, 367, 372, 307)
$graphics.DrawLine($whitePen, 195, 235, 317, 235)
$graphics.DrawLine($whitePen, 195, 282, 317, 282)

$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$whitePen.Dispose()
$gradient.Dispose()
$shape.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output $outputPath
