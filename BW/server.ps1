#region AYARLAR
$Port = 8080
$Path = "webhook"   # http://+:8080/webhook/
$ListenerPrefix = "http://+:$Port/$Path/"

# Windows Auth örneği:
# $SqlConnString = "Server=YOUR_SQL_SERVER;Database=SpeedTestsDb;Integrated Security=SSPI;TrustServerCertificate=True;"
# SQL Auth örneği:
$SqlConnString = "Server=localhost;Database=SpeedTestsDb;User Id=sa;Password=Q1w23e4r!TY..u;TrustServerCertificate=True;"

$DefaultVpn  = "METRO"
#endregion

#region Fonksiyonlar
function Write-Log {
  param([string]$Message,[string]$Level="INFO")
  $ts=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
  $date=(Get-Date).ToString("yyyy-MM-dd")
  $line="$ts [$Level] $Message"
  if (-not (Test-Path ".\logs")){ New-Item -ItemType Directory -Path ".\logs" | Out-Null }
  Write-Host $line
  $line | Out-File -FilePath ".\logs\webhook_log_$date.txt" -Append -Encoding utf8
}

function Update-WebhookStats {
  $f=".\stats\webhook_stats.json"
  if (-not (Test-Path ".\stats")){ New-Item -ItemType Directory -Path ".\stats" | Out-Null }
  if (-not (Test-Path $f)){
    @{ total=0; today=0; last_day=(Get-Date).ToString("yyyy-MM-dd") } |
      ConvertTo-Json -Depth 3 -Compress:$false | Set-Content $f -Encoding utf8
  }
  $s=Get-Content $f | ConvertFrom-Json
  $tag=(Get-Date).ToString("yyyy-MM-dd")
  if ($s.last_day -eq $tag){ $s.today++ } else { $s.today=1; $s.last_day=$tag }
  $s.total++
  $s | ConvertTo-Json -Depth 3 -Compress:$false | Set-Content $f -Encoding utf8
}

function Convert-ToMbps {
  param([string]$SpeedValue,[string]$SpeedUnit)
  if (-not $SpeedValue -or -not $SpeedUnit){ return $null }
  $valStr=($SpeedValue -replace ',', '.').Trim()
  $out=0.0
  if (-not [double]::TryParse($valStr,[System.Globalization.NumberStyles]::Float,[System.Globalization.CultureInfo]::InvariantCulture,[ref]$out)){ return $null }
  $u=$SpeedUnit.Trim().ToLowerInvariant()
  if ($u -match '^(g(bps|bit/s|bits?/sec|bits?/s))$|^giga?bits?/sec$'){ return [decimal]([double]$out*1000) }
  if ($u -match '^(m(bps|bit/s|bits?/sec|bits?/s))$|^mega?bits?/sec$|^mbits?/sec$'){ return [decimal]$out }
  if ($u -match '^(k(bps|bit/s|bits?/sec|bits?/s))$|^kilo?bits?/sec$'){ return [decimal]([double]$out/1000) }
  if ($u -match '^(bps|bit/s|bits?/sec|bits?/s)$'){ return [decimal]([double]$out/1000000) }
  if ($u -match 'm(bit|bits)?/s(ec)?'){ return [decimal]$out }
  if ($u -match 'g(bit|bits)?/s(ec)?'){ return [decimal]([double]$out*1000) }
  if ($u -match 'k(bit|bits)?/s(ec)?'){ return [decimal]([double]$out/1000) }
  return [decimal]$out
}

function Resolve-VpnTypeName {
  param([string]$VpnName)
  if ($VpnName){
    if ($VpnName -match '(?i)\b(GSM|LTE|4G|5G|Cell|Mobile)\b'){ return "GSM" }
    if ($VpnName -match '(?i)\b(METRO|MPLS|Fiber|Leased|Karasal)\b'){ return "METRO" }
  }
  return $DefaultVpn
}

function Parse-SpeedTestBody {
  param([string]$Body)
  $r=[PSCustomObject]@{
    DeviceName=$null; VpnName=$null;
    UpSpeedValue=$null; UpSpeedUnit=$null;
    DownSpeedValue=$null; DownSpeedUnit=$null
  }
  if ([string]::IsNullOrWhiteSpace($Body)){ return $r }
  $lines=$Body -split "\r?\n"

  foreach($line in $lines){
    if ($line -match '^\s*(\S+)\s+execute speed-test-ipsec\s+(\S+)'){ $r.DeviceName=$matches[1]; $r.VpnName=$matches[2]; break }
  }
  $upCli=$lines | ? { $_ -match 'client\(sender\):\s*up_speed' }
  if ($upCli -and ($upCli -match 'up_speed:\s*([0-9.,]+)\s*([A-Za-z/]+)')){ $r.UpSpeedValue=$matches[1]; $r.UpSpeedUnit=$matches[2] }
  $downCli=$lines | ? { $_ -match 'client\(recver\):\s*down_speed' }
  if ($downCli -and ($downCli -match 'down_speed:\s*([0-9.,]+)\s*([A-Za-z/]+)')){ $r.DownSpeedValue=$matches[1]; $r.DownSpeedUnit=$matches[2] }

  if (-not $r.DeviceName){
    $devLine=$lines | ? { $_ -match '(?i)^\s*Cihaz Ad[ıi]\s*:' }
    if ($devLine -and ($devLine -match ':\s*(.+)$')){ $r.DeviceName=$matches[1].Trim() }
  }
  if (-not $r.VpnName){
    $vpnLine=$lines | ? { $_ -match '(?i)^\s*VPN Ad[ıi]\s*:' }
    if ($vpnLine -and ($vpnLine -match ':\s*(.+)$')){ $r.VpnName=$matches[1].Trim() }
  }
  if (-not $r.UpSpeedValue){
    $upLine=$lines | ? { $_ -match '(?i)^\s*Upload H[ıi]z[ıi]\s*:' }
    if ($upLine -and ($upLine -match ':\s*([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+(?:/[A-Za-z]+)?)\s*$')){ $r.UpSpeedValue=$matches[1]; $r.UpSpeedUnit=$matches[2] }
  }
  if (-not $r.DownSpeedValue){
    $downLine=$lines | ? { $_ -match '(?i)^\s*Download H[ıi]z[ıi]\s*:' }
    if ($downLine -and ($downLine -match ':\s*([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+(?:/[A-Za-z]+)?)\s*$')){ $r.DownSpeedValue=$matches[1]; $r.DownSpeedUnit=$matches[2] }
  }
  return $r
}

function Send-JsonResponse {
  param([System.Net.HttpListenerResponse]$Response,[object]$DataObject,[int]$StatusCode)
  $json=$DataObject | ConvertTo-Json -Depth 5
  $buf=[System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode=$StatusCode
  $Response.ContentType="application/json; charset=utf-8"
  $Response.ContentLength64=$buf.Length
  try{ $Response.OutputStream.Write($buf,0,$buf.Length) } finally { $Response.OutputStream.Close() }
}

function Save-SpeedStatToSql {
  param(
    [string]  $DeviceName,   # CityName = DeviceName
    [string]  $VpnTypeName,
    [Nullable[decimal]] $UploadMbps,
    [Nullable[decimal]] $DownloadMbps,
    [string]  $UploadStatus,     # 'OK' / 'N/A'
    [string]  $DownloadStatus,   # 'OK' / 'N/A'
    [datetime]$MeasuredUtc
  )
  if ([string]::IsNullOrWhiteSpace($DeviceName)){ $DeviceName="UNKNOWN" }
  if ([string]::IsNullOrWhiteSpace($VpnTypeName)){ $VpnTypeName="METRO" }
  if (-not $MeasuredUtc){ $MeasuredUtc=(Get-Date).ToUniversalTime() }
  if ([string]::IsNullOrWhiteSpace($UploadStatus)){ $UploadStatus="OK" }
  if ([string]::IsNullOrWhiteSpace($DownloadStatus)){ $DownloadStatus="OK" }

  $tsql=@"
DECLARE @CityID INT, @VpnTypeID INT;

SELECT @CityID=CityID FROM dbo.Cities WHERE CityName=@pCity; -- CityName = DeviceName
IF @CityID IS NULL BEGIN
  INSERT INTO dbo.Cities (CityName) VALUES (@pCity);
  SET @CityID = SCOPE_IDENTITY();
END

SELECT @VpnTypeID=VpnTypeID FROM dbo.VpnTypes WHERE VpnTypeName=@pVpn;
IF @VpnTypeID IS NULL BEGIN
  INSERT INTO dbo.VpnTypes (VpnTypeName) VALUES (@pVpn);
  SET @VpnTypeID = SCOPE_IDENTITY();
END

INSERT INTO dbo.SpeedStats
  (CityID, VpnTypeID, DeviceName, UploadSpeed, DownloadSpeed, UploadStatus, DownloadStatus, MeasuredAt)
VALUES
  (@CityID, @VpnTypeID, @pDevice, @pUp, @pDown, @pUstat, @pDstat, @pTime);
"@

  $conn=New-Object System.Data.SqlClient.SqlConnection($SqlConnString)
  try{
    $conn.Open()
    $cmd=$conn.CreateCommand(); $cmd.CommandText=$tsql

    $null=$cmd.Parameters.Add("@pCity",[System.Data.SqlDbType]::NVarChar,100);   $cmd.Parameters["@pCity"].Value=$DeviceName
    $null=$cmd.Parameters.Add("@pDevice",[System.Data.SqlDbType]::NVarChar,100); $cmd.Parameters["@pDevice"].Value=$DeviceName
    $null=$cmd.Parameters.Add("@pVpn",[System.Data.SqlDbType]::NVarChar,50);     $cmd.Parameters["@pVpn"].Value=$VpnTypeName

    $pUp=$cmd.Parameters.Add("@pUp",[System.Data.SqlDbType]::Decimal);   $pUp.Precision=10; $pUp.Scale=2
    if ($null -ne $UploadMbps) { $pUp.Value=$UploadMbps } else { $pUp.Value=[DBNull]::Value }

    $pDn=$cmd.Parameters.Add("@pDown",[System.Data.SqlDbType]::Decimal); $pDn.Precision=10; $pDn.Scale=2
    if ($null -ne $DownloadMbps) { $pDn.Value=$DownloadMbps } else { $pDn.Value=[DBNull]::Value }

    $null=$cmd.Parameters.Add("@pUstat",[System.Data.SqlDbType]::NVarChar,10);   $cmd.Parameters["@pUstat"].Value=$UploadStatus
    $null=$cmd.Parameters.Add("@pDstat",[System.Data.SqlDbType]::NVarChar,10);   $cmd.Parameters["@pDstat"].Value=$DownloadStatus

    $null=$cmd.Parameters.Add("@pTime",[System.Data.SqlDbType]::DateTime2);      $cmd.Parameters["@pTime"].Value=$MeasuredUtc

    [void]$cmd.ExecuteNonQuery()
    Write-Log "SQL kayıt OK -> Dev='$DeviceName' VPN:$VpnTypeName U:$UploadMbps ($UploadStatus) D:$DownloadMbps ($DownloadStatus) @ $($MeasuredUtc.ToString('yyyy-MM-dd HH:mm:ss'))"
  } catch {
    Write-Log "SQL kayıt HATASI: $($_.Exception.Message)" "ERROR"; throw
  } finally {
    if ($cmd){$cmd.Dispose()}; if ($conn){$conn.Close(); $conn.Dispose()}
  }
}

function Handle-Request {
  param([System.Net.HttpListenerContext]$Context)
  $req=$Context.Request; $resp=$Context.Response
  if ($req.HttpMethod -ne "POST"){
    $err=@{ status="Error"; message="Only POST requests are accepted." }
    Send-JsonResponse -Response $resp -DataObject $err -StatusCode 405
    Write-Log "POST dışı istek geldi: $($req.HttpMethod)" "WARN"; return
  }

  $reader=New-Object System.IO.StreamReader($req.InputStream,$req.ContentEncoding)
  try{
    $body=$reader.ReadToEnd()
    Write-Log "--- Yeni Webhook Alındı ---"

    $p=Parse-SpeedTestBody -Body $body

    Write-Log "Cihaz Adı      : $($p.DeviceName)"
    Write-Log "VPN Adı        : $($p.VpnName)"
    Write-Log "Upload Hızı    : $($p.UpSpeedValue) $($p.UpSpeedUnit)"
    Write-Log "Download Hızı  : $($p.DownSpeedValue) $($p.DownSpeedUnit)"
    Write-Log "-----------------------------"
    Write-Log "DEBUG raw up='$($p.UpSpeedValue) $($p.UpSpeedUnit)' down='$($p.DownSpeedValue) $($p.DownSpeedUnit)'" "INFO"

    $vpnType = Resolve-VpnTypeName -VpnName $p.VpnName
    $upMbps  = Convert-ToMbps -SpeedValue $p.UpSpeedValue   -SpeedUnit $p.UpSpeedUnit
    $downMbps= Convert-ToMbps -SpeedValue $p.DownSpeedValue -SpeedUnit $p.DownSpeedUnit

    # Status ve debug metni (if içinde, ifade olarak değil)
    if ($null -eq $upMbps)   { $upStatus='N/A'; $upText='N/A' }   else { $upStatus='OK'; $upText=$upMbps }
    if ($null -eq $downMbps) { $downStatus='N/A'; $downText='N/A'} else { $downStatus='OK'; $downText=$downMbps }

    $nowUtc=(Get-Date).ToUniversalTime()
    Write-Log "DEBUG conv up=$upText Mbps down=$downText Mbps" "INFO"

    # Eksik olsa da her durumda INSERT
    $dbStatus="inserted"
    try{
      Save-SpeedStatToSql -DeviceName $p.DeviceName -VpnTypeName $vpnType `
        -UploadMbps $upMbps -DownloadMbps $downMbps `
        -UploadStatus $upStatus -DownloadStatus $downStatus `
        -MeasuredUtc $nowUtc
    } catch {
      $dbStatus="error: " + $_.Exception.Message
    }

    $respObj=[PSCustomObject]@{
      status="OK"; timestamp=(Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
      device=$p.DeviceName; city_equals_device=$p.DeviceName
      vpn_connection=$p.VpnName; vpn_type=$vpnType
      up_text=$upText; down_text=$downText
      upload_status=$upStatus; download_status=$downStatus
      db_write=$dbStatus
    }

    Update-WebhookStats
    Send-JsonResponse -Response $resp -DataObject $respObj -StatusCode 200
  } catch {
    Write-Log "İstek işlenirken hata: $($_.Exception.Message)" "ERROR"
    $err=@{ status="Error"; message="$($_.Exception.Message)" }
    Send-JsonResponse -Response $resp -DataObject $err -StatusCode 500
  } finally {
    $reader.Dispose(); $reader.Close()
  }
}
#endregion

#region Dinleyici Başlat
$listener=New-Object System.Net.HttpListener
try{
  $listener.Prefixes.Add($ListenerPrefix)
  $listener.Start()
  Write-Log "Dinleyici başlatıldı: $ListenerPrefix"
  Write-Log "Durdurmak için Ctrl+C tuşlarına basın."
  while($listener.IsListening){
    try{ $ctx=$listener.GetContext(); Handle-Request -Context $ctx }
    catch [System.Net.HttpListenerException]{ Write-Log "Listener durduruluyor: $($_.Exception.Message)" "WARN" }
    catch { Write-Log "Ana döngü hatası: $($_.Exception.Message)" "ERROR" }
  }
} catch { Write-Log "Başlatma hatası: $($_.Exception.Message)" "ERROR" }
finally{
  if($listener -and $listener.IsListening){ Write-Log "Dinleyici durduruluyor..."; $listener.Stop() }
  $listener.Close(); $listener.Dispose(); Write-Log "Dinleyici kapatıldı."
}
#endregion