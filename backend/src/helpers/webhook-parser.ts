/**
 * Webhook Parser Helpers
 *
 * FortiGate speed-test webhook verisini parse eden pure fonksiyonlar.
 * `app.ts` içinden buraya taşındı — birim testleri doğrudan çalışabilsin diye.
 */

/** Convert speed value + unit string to Mbps (number | null) */
export function convertToMbps(value: string, unit: string): number | null {
  if (!value || !unit) return null;
  const normalized = value.replace(',', '.').trim();
  const num = parseFloat(normalized);
  if (isNaN(num)) return null;
  const u = unit.trim().toLowerCase();
  if (/^g(bps|bit\/s|bits?\/sec|bits?\/s)$|^giga?bits?\/sec$/.test(u)) return num * 1000;
  if (/^m(bps|bit\/s|bits?\/sec|bits?\/s)$|^mega?bits?\/sec$|^mbits?\/sec$|^mbit\/s$/.test(u)) return num;
  if (/^k(bps|bit\/s|bits?\/sec|bits?\/s)$|^kilo?bits?\/sec$/.test(u)) return num / 1000;
  if (/^(bps|bit\/s|bits?\/sec|bits?\/s)$/.test(u)) return num / 1_000_000;
  if (/g(bit|bits)?\/s(ec)?/.test(u)) return num * 1000;
  if (/m(bit|bits)?\/s(ec)?/.test(u)) return num;
  if (/k(bit|bits)?\/s(ec)?/.test(u)) return num / 1000;
  return num; // fallback: assume Mbps
}

/** Classify VPN name as GSM or METRO */
export function resolveVpnType(vpnName: string | null): 'GSM' | 'METRO' {
  if (!vpnName) return 'METRO';
  if (/\b(GSM|LTE|4G|5G|Cell|Mobile)\b/i.test(vpnName)) return 'GSM';
  if (/\b(METRO|MPLS|Fiber|Leased|Karasal)\b/i.test(vpnName)) return 'METRO';
  return 'METRO';
}

/** Parse raw FortiGate / BW speed-test body text */
export function parseSpeedTestBody(body: string) {
  const lines = body.split(/\r?\n/);
  let deviceName: string | null = null;
  let vpnName: string | null = null;
  let upValue: string | null = null;
  let upUnit: string | null = null;
  let downValue: string | null = null;
  let downUnit: string | null = null;

  // FortiGate CLI format: "DEVICE_NAME execute speed-test-ipsec VPN_NAME"
  for (const line of lines) {
    const m = line.match(/^\s*(\S+)\s+execute speed-test-ipsec\s+(\S+)/);
    if (m) { deviceName = m[1]; vpnName = m[2]; break; }
  }

  // client(sender): up_speed: X Unit
  const upCliLine = lines.find(l => /client\(sender\):\s*up_speed/.test(l));
  if (upCliLine) {
    const m = upCliLine.match(/up_speed:\s*([0-9.,]+)\s*([A-Za-z/]+)/);
    if (m) { upValue = m[1]; upUnit = m[2]; }
  }

  // client(recver): down_speed: X Unit
  const downCliLine = lines.find(l => /client\(recver\):\s*down_speed/.test(l));
  if (downCliLine) {
    const m = downCliLine.match(/down_speed:\s*([0-9.,]+)\s*([A-Za-z/]+)/);
    if (m) { downValue = m[1]; downUnit = m[2]; }
  }

  // Turkish label fallback
  if (!deviceName) {
    const dl = lines.find(l => /^\s*Cihaz Ad[ıi]\s*:/i.test(l));
    if (dl) { const m = dl.match(/:\s*(.+)$/); if (m) deviceName = m[1].trim(); }
  }
  if (!vpnName) {
    const vl = lines.find(l => /^\s*VPN Ad[ıi]\s*:/i.test(l));
    if (vl) { const m = vl.match(/:\s*(.+)$/); if (m) vpnName = m[1].trim(); }
  }
  if (!upValue) {
    const ul = lines.find(l => /^\s*Upload H[ıi]z[ıi]\s*:/i.test(l));
    if (ul) { const m = ul.match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+(?:\/[A-Za-z]+)?)\s*$/); if (m) { upValue = m[1]; upUnit = m[2]; } }
  }
  if (!downValue) {
    const dl2 = lines.find(l => /^\s*Download H[ıi]z[ıi]\s*:/i.test(l));
    if (dl2) { const m = dl2.match(/:\s*([0-9]+(?:[.,][0-9]+)?)\s*([A-Za-z]+(?:\/[A-Za-z]+)?)\s*$/); if (m) { downValue = m[1]; downUnit = m[2]; } }
  }

  // Generic key: value fallback for Upload/Download
  if (!upValue) {
    const ul = lines.find(l => /^\s*upload[\s_-]*speed\s*:/i.test(l));
    if (ul) { const m = ul.match(/:\s*([0-9.,]+)\s*([A-Za-z/]+)/i); if (m) { upValue = m[1]; upUnit = m[2]; } }
  }
  if (!downValue) {
    const dl3 = lines.find(l => /^\s*download[\s_-]*speed\s*:/i.test(l));
    if (dl3) { const m = dl3.match(/:\s*([0-9.,]+)\s*([A-Za-z/]+)/i); if (m) { downValue = m[1]; downUnit = m[2]; } }
  }

  return { deviceName, vpnName, upValue, upUnit, downValue, downUnit };
}
