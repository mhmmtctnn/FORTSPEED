-- 05_indexes.sql

-- Kapsamlı (Composite) indexler Dashboard / Raporlama sorgularını çok ciddi hızlandırır.
-- MeasuredAt filtresi ile birlikte City veya VPN bazlı istatistikler ve aggregate query'ler (AVG/MAX) hızlanacaktır.

-- Ana gösterge tablosu (zaman kısıtlı + şehir bazlı gruplar) için kompozit index:
CREATE INDEX IF NOT EXISTS idx_composite_measuredat_city
ON SpeedStats (MeasuredAt DESC, CityID)
INCLUDE (DownloadSpeed, UploadSpeed, Latency);

-- Zaman ve hat (VpnType) bazlı gruplar için index:
CREATE INDEX IF NOT EXISTS idx_composite_measuredat_vpn
ON SpeedStats (MeasuredAt DESC, VpnTypeID)
INCLUDE (DownloadSpeed, UploadSpeed, Latency);

-- Şehre özel son 7 gün (örn harita seçimi ve chart için):
CREATE INDEX IF NOT EXISTS idx_composite_city_measuredat
ON SpeedStats (CityID, MeasuredAt DESC)
INCLUDE (DownloadSpeed, UploadSpeed, Latency, VpnTypeID);
