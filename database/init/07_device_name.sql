-- Cities tablosuna FortiGate cihaz adı eşleştirme kolonu
-- Boş bırakılırsa webhook eşleştirmesi CityName'e fallback yapar
ALTER TABLE Cities ADD COLUMN IF NOT EXISTS DeviceName VARCHAR(100);

-- Mevcut kayıtlar için başlangıç değeri yok (NULL = CityName kullan)
-- Tekil eşleştirme için unique index (NULL değerler hariç tutulur)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cities_devicename
  ON Cities (UPPER(DeviceName))
  WHERE DeviceName IS NOT NULL AND DeviceName <> '';
