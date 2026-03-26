import psycopg2
import datetime

conn = psycopg2.connect("postgres://postgres:SecurePassword123@localhost:5432/speedtest_db")
cur = conn.cursor()

# 1. VpnTypes
vpn_types = [
    (1, 'Metro'),
    (2, 'GSM')
]

for vt_id, vt_name in vpn_types:
    cur.execute("INSERT INTO VpnTypes (VpnTypeID, VpnTypeName) VALUES (%s, %s) ON CONFLICT DO NOTHING", (vt_id, vt_name))

# 2. Cities (Sample Data from earlier context)
cities = [
    (1, 'ANKARA-BE', 'ASYA', 'TURKIYE', 'ANKARA', 'BE', 39.9334, 32.8597),
    (2, 'ISTANBUL-DT', 'AVRUPA', 'TURKIYE', 'ISTANBUL', 'DT', 41.0082, 28.9784),
    (3, 'ABUDABI-BE', 'ASYA', 'UAE', 'ABU DHABI', 'BE', 24.4539, 54.3773),
    (4, 'ABUJA-BE', 'AFRIKA', 'NIGERIA', 'ABUJA', 'BE', 9.0765, 7.3986),
    (5, 'ADDISABABA-BE', 'AFRIKA', 'ETHIOPIA', 'ADDIS ABABA', 'BE', 9.0300, 38.7400),
    (6, 'BERLIN-BE', 'AVRUPA', 'GERMANY', 'BERLIN', 'BE', 52.5200, 13.4050),
    (7, 'LONDON-BE', 'AVRUPA', 'UK', 'LONDON', 'BE', 51.5074, -0.1278),
    (8, 'NEWYORK-DT', 'AMERIKA', 'USA', 'NEW YORK', 'DT', 40.7128, -74.0060),
    (9, 'ABB', 'ASYA', 'UNKNOWN', 'UNKNOWN', 'DT', 35.0, 45.0),
    (10, 'ABIDJAN-BE', 'AFRIKA', 'IVORY COAST', 'ABIDJAN', 'BE', 5.36, -4.00),
]

for city in cities:
    cur.execute("""
        INSERT INTO Cities (CityID, CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM) 
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
    """, city)

# 3. SpeedStats
stats = [
    (1, 1, 1, 'GW-ANK-01', 95.50, 45.20, 'OK', 'OK', datetime.datetime.now()),
    (2, 2, 2, 'GW-IST-01', 42.10, 12.50, 'OK', 'OK', datetime.datetime.now()),
    (3, 3, 1, 'GW-ABD-01', 120.00, 80.00, 'OK', 'OK', datetime.datetime.now()),
    (4, 4, 2, 'GW-ABJ-01', 15.20, 5.40, 'OK', 'OK', datetime.datetime.now()),
    (5, 5, 1, 'GW-ADD-01', 35.00, 15.00, 'OK', 'OK', datetime.datetime.now()),
]

for stat in stats:
    cur.execute("""
        INSERT INTO SpeedStats (StatID, CityID, VpnTypeID, DeviceName, DownloadSpeed, UploadSpeed, UploadStatus, DownloadStatus, MeasuredAt)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
    """, stat)

conn.commit()
cur.close()
conn.close()
print("Seed data inserted successfully!")
