#!/usr/bin/env python3
"""
Load CSV data into PostgreSQL database
"""

import psycopg2
import csv
import os
from datetime import datetime

# Database connection
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/speedtest_db')

def load_vpn_types(cursor):
    """Load VPN types from CSV"""
    print("Loading VPN Types...")
    vpn_types = [
        (1, 'METRO'),
        (2, 'GSM')
    ]
    
    for vpn_id, vpn_name in vpn_types:
        cursor.execute(
            "INSERT INTO VpnTypes (VpnTypeID, VpnTypeName) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (vpn_id, vpn_name)
        )
    print(f"  ✓ {len(vpn_types)} VPN types loaded")

def load_cities(cursor):
    """Load Cities from CSV"""
    print("Loading Cities...")
    csv_file = 'speedtest/Cities.csv'
    
    count = 0
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) >= 8:
                try:
                    city_id = int(row[0])
                    city_name = row[1]
                    kita = row[2]
                    ulke = row[3]
                    il = row[4]
                    turu = row[5]
                    enlem = float(row[6])
                    boylam = float(row[7])
                    
                    cursor.execute(
                        """INSERT INTO Cities (CityID, CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM) 
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) 
                           ON CONFLICT (CityName) DO NOTHING""",
                        (city_id, city_name, kita, ulke, il, turu, enlem, boylam)
                    )
                    count += 1
                except Exception as e:
                    print(f"  Warning: Error loading row {row}: {e}")
                    continue
    
    print(f"  ✓ {count} cities loaded")

def load_speedstats(cursor):
    """Load SpeedStats from CSV"""
    print("Loading SpeedStats...")
    csv_file = 'speedtest/speedstats.csv'
    
    count = 0
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) >= 9:
                try:
                    # CSV format: StatID, CityID, VpnTypeID, DeviceName, UploadSpeed, DownloadSpeed, UploadStatus, DownloadStatus, MeasuredAt
                    city_id = int(row[1])
                    vpn_type_id = int(row[2])
                    device_name = row[3]
                    upload_speed = float(row[4]) if row[4] and row[4].upper() != 'NULL' else None
                    download_speed = float(row[5]) if row[5] and row[5].upper() != 'NULL' else None
                    upload_status = row[6] if row[6] != 'NULL' else 'OK'
                    download_status = row[7] if row[7] != 'NULL' else 'OK'
                    measured_at = row[8] if row[8] != 'NULL' else datetime.now().isoformat()
                    
                    cursor.execute(
                        """INSERT INTO SpeedStats 
                           (CityID, VpnTypeID, DeviceName, UploadSpeed, DownloadSpeed, 
                            UploadStatus, DownloadStatus, MeasuredAt, Latency) 
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0)""",
                        (city_id, vpn_type_id, device_name, upload_speed, 
                         download_speed, upload_status, download_status, measured_at)
                    )
                    count += 1
                except Exception as e:
                    print(f"  Warning: Error loading row {row}: {e}")
                    continue
    
    print(f"  ✓ {count} speed stats loaded")

def main():
    try:
        # Connect to database
        conn = psycopg2.connect(DB_URL)
        cursor = conn.cursor()
        
        print("Starting data loading...")
        print(f"Database: {DB_URL}\n")
        
        # Load data
        load_vpn_types(cursor)
        load_cities(cursor)
        load_speedstats(cursor)
        
        # Commit changes
        conn.commit()
        cursor.close()
        conn.close()
        
        print("\n✓ Data loading completed successfully!")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        exit(1)

if __name__ == '__main__':
    main()
