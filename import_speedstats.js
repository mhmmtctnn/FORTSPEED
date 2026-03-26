/**
 * speedstats.csv -> PostgreSQL import (Node.js)
 * CSV separator: ;
 * Sayısal bozulmalar: Excel Türkçe ay kısaltmaları (Oca.20 -> 1.20, 22.Eki -> 22.10 vb.)
 * Tarih: dd.MM.yyyy HH:mm
 */
const fs = require('fs');
const readline = require('readline');
const { Client } = require('pg');

const AY = {
  'Oca': '1', 'Şub': '2', 'Mar': '3', 'Nis': '4',
  'May': '5', 'Haz': '6', 'Tem': '7', 'Ağu': '8',
  'Eyl': '9', 'Eki': '10', 'Kas': '11', 'Ara': '12'
};
// Byte-safe ay eşleşmesi için
const AY_REGEX = /^(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)\.([\d]+)$|^([\d]+)\.(Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara)$/;

function parseSpeed(val) {
  if (!val || val === 'NULL' || val === 'N/A') return null;
  val = val.trim();
  // Türkçe ay başlangıcı: Oca.20
  for (const [ay, num] of Object.entries(AY)) {
    if (val.startsWith(ay + '.')) {
      const rest = val.slice(ay.length + 1);
      return parseFloat(`${num}.${rest}`);
    }
    if (val.endsWith('.' + ay)) {
      const first = val.slice(0, val.length - ay.length - 1);
      return parseFloat(`${first}.${num}`);
    }
  }
  const n = parseFloat(val.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  // dd.MM.yyyy HH:mm
  if (!val || val === 'NULL') return null;
  val = val.trim();
  // "19.08.2025 15:18"
  const m = val.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6] || '00'}`;
  return null;
}

async function main() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'speedtest_db',
    user: 'postgres',
    password: 'SecurePassword123',
  });
  await client.connect();
  console.log('DB bağlantısı kuruldu.');

  // Temizle
  await client.query('TRUNCATE TABLE SpeedStats RESTART IDENTITY;');
  console.log('Mevcut SpeedStats temizlendi.');

  const SQL = `INSERT INTO SpeedStats (CityID, VpnTypeID, DeviceName, UploadSpeed, DownloadSpeed,
               UploadStatus, DownloadStatus, MeasuredAt)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`;

  const rl = readline.createInterface({ input: fs.createReadStream('speedtest/speedstats.csv', 'utf8'), crlfDelay: Infinity });
  
  let first = true;
  let total = 0, skipped = 0, errors = 0;
  let batch = [];
  const BATCH_SIZE = 2000;

  const flushBatch = async () => {
    const promises = batch.map(r => client.query(SQL, r).catch(() => { errors++; }));
    await Promise.all(promises);
    total += batch.length;
    batch = [];
    process.stdout.write(`\r  ${total.toLocaleString()} kayıt işlendi...`);
  };

  for await (const line of rl) {
    if (first) { first = false; continue; } // header
    const parts = line.split(';');
    if (parts.length < 9) { skipped++; continue; }

    const cityId  = parseInt(parts[1]);
    const vpnId   = parseInt(parts[2]);
    const device  = (parts[3] || '').trim().slice(0, 100) || 'Unknown';
    const upload  = parseSpeed(parts[4]);
    const download= parseSpeed(parts[5]);
    const upSt    = (parts[6] || 'N/A').trim().slice(0, 10);
    const dnSt    = (parts[7] || 'N/A').trim().slice(0, 10);
    const date    = parseDate(parts[8]);

    if (isNaN(cityId) || isNaN(vpnId) || !date) { skipped++; continue; }

    batch.push([cityId, vpnId, device, upload, download, upSt, dnSt, date]);
    if (batch.length >= BATCH_SIZE) await flushBatch();
  }

  if (batch.length > 0) await flushBatch();

  await client.end();
  console.log(`\n✅ Tamamlandı! Eklenen: ${total.toLocaleString()}, Atlanan: ${skipped.toLocaleString()}, Hata: ${errors}`);
}

main().catch(e => { console.error('Kritik hata:', e); process.exit(1); });
