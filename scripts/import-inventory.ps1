param([string]$Source = 'C:\Users\frana\Downloads\Inventario Elite Club (1).xlsm')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::OpenRead($Source)
function ReadXml($p) { $r=[IO.StreamReader]::new($z.GetEntry($p).Open()); [xml]$v=$r.ReadToEnd(); $r.Close(); return $v }
$s=ReadXml 'xl/sharedStrings.xml'
$strings=@($s.SelectNodes('//*[local-name()="si"]') | ForEach-Object { ($_.SelectNodes('.//*[local-name()="t"]') | ForEach-Object InnerText) -join '' })
$rels=ReadXml 'xl/drawings/_rels/drawing1.xml.rels'
$images=@{}; foreach($r in $rels.DocumentElement.ChildNodes){$images[$r.Id]=[IO.Path]::GetFileName($r.Target)}
$drawing=ReadXml 'xl/drawings/drawing1.xml'; $rowImages=@{}
foreach($anchor in $drawing.DocumentElement.ChildNodes){$row=[int]$anchor.from.row+1; $blip=$anchor.SelectSingleNode('.//*[local-name()="blip"]'); if($blip -and [int]$anchor.from.col -eq 11){$rowImages[$row]=$images[$blip.GetAttribute('embed','http://schemas.openxmlformats.org/officeDocument/2006/relationships')]}}
New-Item -ItemType Directory -Force public/products,src/data | Out-Null
$sheet=ReadXml 'xl/worksheets/sheet1.xml'; $products=@()
foreach($row in $sheet.SelectNodes('//*[local-name()="row"]')){
  if([int]$row.r -lt 2){continue}; $cells=@{}
  foreach($cell in $row.SelectNodes('./*[local-name()="c"]')) { $value=$cell.v; if($cell.t -eq 's'){$value=$strings[[int]$value]}; $cells[($cell.r -replace '\d','')]=[string]$value }
  if(-not $cells['A'] -or -not $cells['N'] -or -not $cells['O']){continue}
  $photo=$rowImages[[int]$row.r]
  if($photo){$target=Join-Path (Get-Location) "public/products/$photo"; [IO.Compression.ZipFileExtensions]::ExtractToFile($z.GetEntry("xl/media/$photo"),$target,$true)}
  $products+= [ordered]@{id="elite-$($row.r)";name=$cells['A'].Trim();size=$cells['C'].Trim();brand=$cells['N'].Trim();type=$cells['O'].Trim();image=$(if($photo){"/products/$photo"}else{'/placeholder.svg'})}
}
$z.Dispose()
[IO.File]::WriteAllText((Join-Path (Get-Location) 'src/data/products.json'),(ConvertTo-Json -InputObject $products -Depth 5),[Text.UTF8Encoding]::new($false))
Write-Output "Imported $($products.Count) products using only the requested fields."
