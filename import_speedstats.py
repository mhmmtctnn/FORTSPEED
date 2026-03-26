"""
speedstats.csv -> PostgreSQL import script
Sorunlar:
- Separator: ;  (noktalı virgül)
- Tarih: dd.MM.yyyy HH:mm  (Türkçe)
- Bozuk sayılar: Excel'in Türkçe locale'de tarih olarak yorumladığı değerler
  Oca=1, Şub=2, Mar=3, Nis=4, May=5, Haz=6, Tem=7, Ağu=8, Eyl=9, Eki=10, Kas=11, Ara=12
  Örn: "Oca.20" -> 1.20, "Nis.94" -> 4.94, "22.Eki" -> 22.10
- NULL: "NULL" string -> gerçek NULL
"""

import csv
import psycopg2
from datetime import datetime
import sys

# Türkçe ay kısaltma -> ay numarası
AY_MAP = {
    'Oca': '1', 'Şub': '2', 'Mar': '3', 'Nis': '4',
    'May': '5', 'Haz': '6', 'Tem': '7', 'Ağu': '8',
    'Eyl': '9', 'Eki': '10', 'Kas': '11', 'Ara': '12'
}

def parse_speed(val: str):
    """'Oca.20' -> 1.20, '22.Eki' -> 22.10, 'NULL' -> None, '17.50' -> 17.50"""
    if not val or val.strip() in ('NULL', 'N/A', ''):
        return None
    val = val.strip()
    # Türkçe ay kısaltması var mı?
    for ay, num in AY_MAP.items():
        if val.startswith(ay + '.'):
            # Oca.20 -> 1.20
            rest = val[len(ay)+1:]
            return float(f"{num}.{rest}")
        if val.endswith('.' + ay):
            # 22.Eki -> 22.10
            first = val[:-(len(ay)+1)]
            return float(f"{first}.{num}")
    try:
        return float(val.replace(',', '.'))
    except:
        return None

def parse_date(val: str):
    """'19.08.2025 15:18' -> datetime"""
    if not val or val.strip() in ('NULL', ''):
        return None
    val = val.strip()
    for fmt in ('%d.%m.%Y %H:%M', '%d.%m.%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            return datetime.strptime(val, fmt)
        except:
            continue
    return None

def parse_status(val: str):
    if not val or val.strip() in ('NULL', 'N/A', ''):
        return 'N/A'
    return val.strip()[:10]

# DB bağlantısı
conn = psycopg2.connect(
    host='localhost',
    port=5432,
    dbname='speedtest_db',
    user='postgres',
    password='SecurePassword123'
)
cur = conn.cursor()

# Mevcut verileri temizle
print("Mevcut SpeedStats verileri temizleniyor...")
cur.execute("TRUNCATE TABLE SpeedStats RESTART IDENTITY;")
conn.commit()

csv_file = 'speedtest/speedstats.csv'
BATCH = 5000
batch = []
total = 0
skipped = 0
errors = 0

INSERT_SQL = """
    INSERT INTO SpeedStats (CityID, VpnTypeID, DeviceName, UploadSpeed, DownloadSpeed,
                            UploadStatus, DownloadStatus, MeasuredAt)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT DO NOTHING
"""

print(f"CSV okunuyor: {csv_file}")

with open(csv_file, 'r', encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';')
    header = next(reader)
    print(f"Başlık: {header}")

    for row in reader:
        if len(row) < 9:
            skipped += 1
            continue

        city_id_s   = row[1].strip()
        vpn_type_s  = row[2].strip()
        device      = row[3].strip()[:100]
        upload_s    = row[4].strip()
        download_s  = row[5].strip()
        up_status   = parse_status(row[6])
        dn_status   = parse_status(row[7])
        date_s      = row[8].strip()

        # CityID / VpnTypeID
        try:
            city_id  = int(city_id_s)
            vpn_type = int(vpn_type_s)
        except:
            skipped += 1
            continue

        upload   = parse_speed(upload_s)
        download = parse_speed(download_s)
        measured = parse_date(date_s)

        if measured is None:
            skipped += 1
            continue

        batch.append((city_id, vpn_type, device, upload, download, up_status, dn_status, measured))

        if len(batch) >= BATCH:
            try:
                cur.executemany(INSERT_SQL, batch)
                conn.commit()
                total += len(batch)
                print(f"  {total:,} kayıt eklendi...", end='\r', flush=True)
            except Exception as e:
                conn.rollback()
                errors += len(batch)
                print(f"\nHata (batch): {e}")
            batch = []

# Kalan
if batch:
    try:
        cur.executemany(INSERT_SQL, batch)
        conn.commit()
        total += len(batch)
    except Exception as e:
        conn.rollback()
        errors += len(batch)
        print(f"\nSon batch hatası: {e}")

cur.close()
conn.close()

print(f"\n✅ Tamamlandı!")
print(f"   Eklenen : {total:,}")
print(f"   Atlanan : {skipped:,}")
print(f"   Hata    : {errors:,}")
