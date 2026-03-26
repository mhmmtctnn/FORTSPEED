const { Client } = require('pg');
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { fixSpeed, fixDate, parseCoord } = require('./speedtest-utils');

const pgConfig = {
    connectionString: "postgres://postgres:SecurePassword123@localhost:5432/speedtest_db"
};

async function loadData() {
    const client = new Client(pgConfig);
    await client.connect();
    console.log("PostgreSQL bağlantısı kuruldu.");

    try {
        // 1. Temizlik
        console.log("Mevcut veriler temizleniyor...");
        await client.query("TRUNCATE SpeedStats, Cities, VpnTypes RESTART IDENTITY CASCADE;");

        // 2. VpnTypes
        console.log("VpnTypes yükleniyor...");
        await client.query(`
            INSERT INTO VpnTypes (VpnTypeID, VpnTypeName) VALUES (1, 'METRO'), (2, 'GSM')
        `);

        // 3. Cities
        console.log("Cities yükleniyor...");
        const citiesContent = fs.readFileSync(path.join('speedtest', 'Cities.csv'), 'utf8');
        const cityLines = citiesContent.split('\n').filter(l => l.trim());
        let cityCount = 0, cityErrors = 0;

        for (let i = 1; i < cityLines.length; i++) {
            const parts = cityLines[i].trim().split(',');
            if (parts.length < 2) continue;
            const [idStr, name, kita, ulke, il, turu, latStr, lonStr] = parts;
            const id = parseInt(idStr);
            if (isNaN(id)) continue;
            try {
                await client.query(`
                    INSERT INTO Cities (CityID, CityName, KITA, ULKE, IL, TURU, ENLEM, BOYLAM)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                    ON CONFLICT (CityID) DO UPDATE SET
                        CityName=EXCLUDED.CityName, KITA=EXCLUDED.KITA, ULKE=EXCLUDED.ULKE,
                        IL=EXCLUDED.IL, TURU=EXCLUDED.TURU, ENLEM=EXCLUDED.ENLEM, BOYLAM=EXCLUDED.BOYLAM
                `, [
                    id, name?.trim() || '',
                    (!kita || kita.trim() === 'NULL') ? null : kita.trim(),
                    (!ulke || ulke.trim() === 'NULL') ? null : ulke.trim(),
                    (!il   || il.trim()   === 'NULL') ? null : il.trim(),
                    (!turu || turu.trim() === 'NULL') ? null : turu.trim(),
                    parseCoord(latStr),
                    parseCoord(lonStr)
                ]);
                cityCount++;
            } catch (err) {
                cityErrors++;
                if (cityErrors <= 5) console.error(`  City hata (${name?.trim()}): ${err.message}`);
            }
        }
        console.log(`Cities: ${cityCount} yüklendi, ${cityErrors} hata.`);

        // 4. SpeedStats (streaming - büyük dosya olabilir)
        console.log("SpeedStats yükleniyor...");
        const stream = fs.createReadStream(path.join('speedtest', 'speedstats.csv'));
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

        let isHeader = true;
        let statCount = 0, statErrors = 0, statSkipped = 0;
        let batch = [];
        const BATCH_SIZE = 500;

        const insertBatch = async (rows) => {
            if (!rows.length) return;
            const vals = [];
            const ph = rows.map((r, i) => {
                const o = i * 9;
                vals.push(...r);
                return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9})`;
            });
            await client.query(`
                INSERT INTO SpeedStats
                    (StatID,CityID,VpnTypeID,DeviceName,UploadSpeed,DownloadSpeed,UploadStatus,DownloadStatus,MeasuredAt)
                VALUES ${ph.join(',')}
                ON CONFLICT (StatID) DO NOTHING
            `, vals);
        };

        for await (const line of rl) {
            if (isHeader) { isHeader = false; continue; }
            const l = line.trim();
            if (!l) continue;

            const parts = l.split(';');
            if (parts.length < 9) continue;

            const [statIdStr, cityIdStr, vpnIdStr, device, uploadRaw, downloadRaw, uStatus, dStatus, dateRaw] = parts;
            const statId  = parseInt(statIdStr);
            const cityId  = parseInt(cityIdStr);
            const vpnId   = parseInt(vpnIdStr);

            if (isNaN(statId) || isNaN(cityId) || isNaN(vpnId)) { statSkipped++; continue; }

            const ts = fixDate(dateRaw);
            if (!ts) { statSkipped++; continue; }

            batch.push([
                statId, cityId, vpnId,
                device?.trim() || 'Unknown',
                fixSpeed(uploadRaw),
                fixSpeed(downloadRaw),
                (uStatus?.trim() === 'N/A' ? 'N/A' : uStatus?.trim()) || 'OK',
                (dStatus?.trim() === 'N/A' ? 'N/A' : dStatus?.trim()) || 'OK',
                ts
            ]);

            if (batch.length >= BATCH_SIZE) {
                try {
                    await insertBatch(batch);
                    statCount += batch.length;
                    if (statCount % 5000 === 0) console.log(`  ${statCount} SpeedStats yüklendi...`);
                } catch (err) {
                    statErrors += batch.length;
                    if (statErrors <= 10) console.error(`  Batch hata: ${err.message}`);
                }
                batch = [];
            }
        }

        // Son batch
        if (batch.length) {
            try {
                await insertBatch(batch);
                statCount += batch.length;
            } catch (err) {
                statErrors += batch.length;
            }
        }

        console.log(`SpeedStats: ${statCount} yüklendi, ${statErrors} hata, ${statSkipped} atlandı.`);

        // Sequence'leri max ID'ye sıfırla (webhook insert için önemli)
        await client.query(`SELECT setval('cities_cityid_seq', COALESCE((SELECT MAX(CityID) FROM Cities), 1))`);
        await client.query(`SELECT setval('speedstats_statid_seq', COALESCE((SELECT MAX(StatID) FROM SpeedStats), 1))`);
        await client.query(`SELECT setval('vpntypes_vpntypeid_seq', COALESCE((SELECT MAX(VpnTypeID) FROM VpnTypes), 1))`);
        console.log("Sequence'ler güncellendi.");

        console.log("\n✓ Veri yükleme TAMAMLANDI!");

    } catch (err) {
        console.error("Kritik hata:", err);
    } finally {
        await client.end();
    }
}

loadData();
