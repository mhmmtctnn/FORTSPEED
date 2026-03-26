// Utility functions extracted from load_data.js - separately testable

const MONTHS = {
    'Oca': '1', 'Şub': '2', 'Mar': '3', 'Nis': '4',
    'May': '5', 'Haz': '6', 'Tem': '7', 'Ağu': '8',
    'Eyl': '9', 'Eki': '10', 'Kas': '11', 'Ara': '12'
};

/**
 * Fixes speed values corrupted by Excel Turkish month abbreviations.
 * "Oca.20" → 1.20, "22.Eki" → 22.10, "Nis.47" → 4.47
 */
function fixSpeed(raw) {
    if (!raw || raw.trim() === 'NULL' || raw.trim() === 'N/A') return null;
    let val = raw.trim();
    for (const [tr, num] of Object.entries(MONTHS)) {
        val = val.replace(new RegExp(tr, 'g'), num);
    }
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}

/**
 * Parses Turkish date format "DD.MM.YYYY HH:MM" or "DD.MM.YYYY HH:MM:SS" to ISO timestamp.
 */
function fixDate(raw) {
    if (!raw || raw.trim() === 'NULL') return null;
    const str = raw.trim();
    const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
        const [, dd, mm, yyyy, hh, min, ss = '00'] = m;
        return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
    }
    return str;
}

/**
 * Parses a clean coordinate string to a float. Returns null for NULL/empty/invalid.
 */
function parseCoord(raw) {
    if (!raw || raw.trim() === 'NULL' || raw.trim() === '') return null;
    const n = parseFloat(raw.trim());
    return isNaN(n) ? null : n;
}

module.exports = { fixSpeed, fixDate, parseCoord, MONTHS };
