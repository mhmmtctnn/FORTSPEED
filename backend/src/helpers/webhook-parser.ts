/**
 * Webhook Parser Helpers
 *
 * FortiGate speed-test + SDWAN webhook verisini parse eden pure fonksiyonlar.
 * server.ps1 (BW/server.ps1) ile birebir aynı mantık — TypeScript portu.
 */

/** Payload türünü otomatik tespit et — combined: hem members hem status aynı body'de */
export function detectPayloadType(body: string): 'speedtest' | 'sdwan_members' | 'sdwan_status' | 'sdwan_combined' | 'sdwan_json' | 'unknown' {
  // FortiGate CLI format
  const hasMembers = /config\s+members/.test(body) && /set\s+interface/.test(body);
  const hasStatus  = /sdwan_mbr_seq=/.test(body);
  if (hasMembers && hasStatus) return 'sdwan_combined';
  if (hasStatus)  return 'sdwan_status';
  if (hasMembers) return 'sdwan_members';
  if (/up_speed:|down_speed:|execute\s+speed-test-ipsec|upload[_\-]?speed|download[_\-]?speed/i.test(body)) return 'speedtest';
  // FortiGate SDWAN komut satırı (çıktısız) — "DEVICE diagnose sys session list | grep sdwan"
  //                                            "DEVICE show system sdwan"
  if (/diagnose\s+sys\s+session.*sdwan|show\s+system\s+sdwan/i.test(body)) return 'sdwan_status';
  // JSON format: {"deviceName":"...","members":[...],...} veya {"sdwan":{...}}
  try {
    const j = JSON.parse(body);
    if (j && (Array.isArray(j.members) || j.sdwan || j.sdwan_members)) return 'sdwan_json';
  } catch { /* not JSON */ }
  return 'unknown';
}

/** JSON formatındaki SDWAN payload'ını parse et.
 *  Desteklenen formatlar:
 *  { deviceName, members:[{seqId,interfaceName,cost?}], activeMemberSeq? }
 *  { device, members:[{seq,iface,cost?}], activeSeq? }
 */
export function parseSdwanJson(body: string): {
  deviceName: string | null;
  members: { seqId: number; interfaceName: string; cost: number | null }[];
  activeMemberSeq: number | null;
} {
  try {
    const j = JSON.parse(body);
    const deviceName: string | null = j.deviceName ?? j.device ?? j.devname ?? null;
    const activeMemberSeq: number | null =
      j.activeMemberSeq ?? j.activeSeq ?? j.active_seq ?? j.sdwan_mbr_seq ?? null;

    const rawMembers: any[] = j.members ?? j.sdwan_members ?? [];
    const members = rawMembers.map((m: any) => ({
      seqId: Number(m.seqId ?? m.seq ?? m.seq_id ?? m.id ?? 0),
      interfaceName: String(m.interfaceName ?? m.iface ?? m.interface ?? m.name ?? ''),
      cost: m.cost != null ? Number(m.cost) : null,
    })).filter(m => m.seqId > 0 && m.interfaceName);

    return { deviceName, members, activeMemberSeq };
  } catch {
    return { deviceName: null, members: [], activeMemberSeq: null };
  }
}

export interface SdwanMemberEntry { seqId: number; interfaceName: string; cost: number | null; }

/** "show system sdwan | grep members" çıktısını parse et */
export function parseSdwanMembers(body: string): {
  deviceName: string | null;
  members: SdwanMemberEntry[];
} {
  const lines = body.split(/\r?\n/);
  let deviceName: string | null = null;

  // "DEVICE_NAME #" satırından cihaz adını al
  for (const line of lines) {
    // "DEVICE # command" veya "DEVICE  command" (# olmadan da eşleş)
    const m = line.match(/^\s*(\S+)\s+(?:#\s+)?show\s+system\s+sdwan/i)
           || line.match(/^\s*(\S+)\s+#\s/);
    if (m) { deviceName = m[1]; break; }
  }

  const members: SdwanMemberEntry[] = [];
  let inMembers = false;
  let curSeq: number | null = null;
  let curIface: string | null = null;
  let curCost: number | null = null;

  const flush = () => {
    if (curSeq !== null && curIface !== null) {
      members.push({ seqId: curSeq, interfaceName: curIface, cost: curCost });
    }
    curSeq = null; curIface = null; curCost = null;
  };

  for (const line of lines) {
    if (/^\s*config\s+members\s*$/.test(line)) { inMembers = true; continue; }
    if (!inMembers) continue;
    if (/^\s*end\s*$/.test(line)) { flush(); inMembers = false; break; }

    const editM = line.match(/^\s*edit\s+(\d+)/);
    if (editM) { flush(); curSeq = parseInt(editM[1]); continue; }

    const ifaceM = line.match(/set\s+interface\s+"([^"]+)"/);
    if (ifaceM) { curIface = ifaceM[1]; continue; }

    const costM = line.match(/set\s+cost\s+(\d+)/);
    if (costM) { curCost = parseInt(costM[1]); continue; }

    if (/^\s*next\s*$/.test(line)) { flush(); }
  }

  return { deviceName, members };
}

/** "diagnose sys session list | grep sdwan" çıktısını parse et */
export function parseSdwanStatus(body: string): {
  deviceName: string | null;
  activeMemberSeq: number | null;
} {
  const lines = body.split(/\r?\n/);
  let deviceName: string | null = null;
  let activeMemberSeq: number | null = null;

  for (const line of lines) {
    const m = line.match(/^\s*(\S+)\s+(?:#\s+)?(?:show|diagnose)\s+/i)
           || line.match(/^\s*(\S+)\s+#\s/);
    if (m) { deviceName = m[1]; break; }
  }
  for (const line of lines) {
    const m = line.match(/sdwan_mbr_seq=(\d+)/);
    if (m) { activeMemberSeq = parseInt(m[1]); break; }
  }

  return { deviceName, activeMemberSeq };
}

/** Convert speed value + unit string to Mbps (number | null) */
export function convertToMbps(value: string, unit: string): number | null {
  if (!value || !unit) return null;
  const normalized = value.replace(',', '.').trim();
  const num = parseFloat(normalized);
  if (isNaN(num)) return null;
  const u = unit.trim().toLowerCase();
  // Gbps variants
  if (/^(g(bps|bit\/s|bits?\/sec|bits?\/s))$|^giga?bits?\/sec$/.test(u)) return num * 1000;
  if (/g(bit|bits)?\/s(ec)?/.test(u)) return num * 1000;
  // Mbps variants — Mbits/sec de dahil
  if (/^(m(bps|bit\/s|bits?\/sec|bits?\/s|bits\/sec))$|^mega?bits?\/sec$|^mbits?\/sec$|^mbit\/s$/.test(u)) return num;
  if (/m(bit|bits)?\/s(ec)?/.test(u)) return num;
  // Kbps variants
  if (/^(k(bps|bit\/s|bits?\/sec|bits?\/s))$|^kilo?bits?\/sec$/.test(u)) return num / 1000;
  if (/k(bit|bits)?\/s(ec)?/.test(u)) return num / 1000;
  // bps
  if (/^(bps|bit\/s|bits?\/sec|bits?\/s)$/.test(u)) return num / 1_000_000;
  return num; // fallback: assume Mbps
}

/** Classify VPN name as GSM or METRO — mirrors Resolve-VpnTypeName in server.ps1 */
export function resolveVpnType(vpnName: string | null): 'GSM' | 'METRO' | 'HUB' {
  if (!vpnName) return 'METRO';
  const upper = vpnName.toUpperCase();
  // HUB keywords — merkez/hub bağlantıları
  if (/\bHUB\b|_HUB|HUB_/.test(upper)) return 'HUB';
  // GSM keywords
  if (/GSM|_GSM|LTE|4G|5G|CELL|MOBILE/.test(upper)) return 'GSM';
  // METRO / karasal keywords
  if (/METRO|MPLS|FIBER|LEASED|KARASAL/.test(upper)) return 'METRO';
  return 'METRO'; // default
}

/** Parse raw FortiGate / BW speed-test body text — mirrors Parse-SpeedTestBody in server.ps1 */
export function parseSpeedTestBody(body: string) {
  const lines = body.split(/\r?\n/);
  let deviceName: string | null = null;
  let vpnName: string | null = null;
  let upValue: string | null = null;
  let upUnit: string | null = null;
  let downValue: string | null = null;
  let downUnit: string | null = null;
  let latencyMs: number | null = null;

  // ── 1. FortiGate CLI format: "DEVICE_NAME execute speed-test-ipsec VPN_NAME [all]"
  //    Matches: "GUVENLIK_ODASI  execute speed-test-ipsec BALGAT_KARASAL all"
  for (const line of lines) {
    const m = line.match(/^\s*(\S+)\s+execute speed-test-ipsec\s+(\S+)/);
    if (m) { deviceName = m[1]; vpnName = m[2]; break; }
  }

  // ── 2. FortiGate "start speedtest VPN: IP -> IP" (fallback device/vpn detection)
  //    Matches: "start speedtest BALGAT_GSM: 10.x.x.x -> 212.x.x.x"
  if (!deviceName || !vpnName) {
    for (const line of lines) {
      const m = line.match(/start speedtest\s+(\S+?)(?:\((\S+?)\))?:/i);
      if (m) {
        if (!vpnName) vpnName = m[1];
        if (!deviceName && m[2]) deviceName = m[2];
        else if (!deviceName) deviceName = m[1];
        break;
      }
    }
  }

  // ── 3. Header block: "========== #N, DATE ==========" → extract device from NEXT execute line
  //    (already handled by step 1 above since those lines also exist in the payload)

  // ── 4. FortiGate result: "client(sender): up_speed: X Unit"  (server.ps1 line 79)
  const upCliLine = lines.find(l => /client\(sender\):\s*up_speed/.test(l));
  if (upCliLine) {
    const m = upCliLine.match(/up_speed:\s*([0-9.,]+)\s*([A-Za-z/]+)/);
    if (m) { upValue = m[1]; upUnit = m[2]; }
  }

  // ── 5. FortiGate result: "client(recver): down_speed: X Unit"  (server.ps1 line 81)
  const downCliLine = lines.find(l => /client\(recver\):\s*down_speed/.test(l));
  if (downCliLine) {
    const m = downCliLine.match(/down_speed:\s*([0-9.,]+)\s*([A-Za-z/]+)/);
    if (m) { downValue = m[1]; downUnit = m[2]; }
  }

  // ── 6. FortiGate alternative: "upload_speed: X" / "download_speed: X"
  if (!upValue) {
    const l = lines.find(ln => /upload[_-]?speed\s*[:=]\s*[0-9]/i.test(ln));
    if (l) { const m = l.match(/[:=]\s*([0-9.,]+)\s*([A-Za-z/]*)/); if (m) { upValue = m[1]; upUnit = m[2] || 'Mbps'; } }
  }
  if (!downValue) {
    const l = lines.find(ln => /download[_-]?speed\s*[:=]\s*[0-9]/i.test(ln));
    if (l) { const m = l.match(/[:=]\s*([0-9.,]+)\s*([A-Za-z/]*)/); if (m) { downValue = m[1]; downUnit = m[2] || 'Mbps'; } }
  }

  // ── 7. FortiGate bandwidth/throughput fallback: "bandwidth: X Mbps"
  if (!upValue) {
    const l = lines.find(ln => /\bthroughput\b|\bbandwidth\b/i.test(ln));
    if (l) { const m = l.match(/([0-9.,]+)\s*(Gbps|Mbps|Kbps|bps)/i); if (m) { upValue = m[1]; upUnit = m[2]; } }
  }

  // ── 8. Turkish label fallback (server.ps1 lines 84-98)
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

  // ── 9. Generic key=value / key: value fallbacks
  if (!upValue) {
    const ul = lines.find(l => /^\s*upload[\s_-]*speed\s*:/i.test(l));
    if (ul) { const m = ul.match(/:\s*([0-9.,]+)\s*([A-Za-z/]+)/i); if (m) { upValue = m[1]; upUnit = m[2]; } }
  }
  if (!downValue) {
    const dl3 = lines.find(l => /^\s*download[\s_-]*speed\s*:/i.test(l));
    if (dl3) { const m = dl3.match(/:\s*([0-9.,]+)\s*([A-Za-z/]+)/i); if (m) { downValue = m[1]; downUnit = m[2]; } }
  }

  // ── 10. Latency / RTT parsing
  // FortiGate: "latency: X ms" / "rtt: X ms" / "ping: X ms" / "Gecikme: X ms"
  for (const line of lines) {
    const m = line.match(/(?:latency|rtt|ping|gecikme|round[_-]?trip)\s*[:=]\s*([0-9.,]+)\s*(?:ms)?/i);
    if (m) { latencyMs = parseFloat(m[1].replace(',', '.')); break; }
  }
  // FortiGate CLI: "client(sender): rtt: X ms"
  if (latencyMs === null) {
    const rttLine = lines.find(l => /rtt\s*:/i.test(l));
    if (rttLine) { const m = rttLine.match(/rtt\s*:\s*([0-9.,]+)/i); if (m) latencyMs = parseFloat(m[1]); }
  }
  // Turkish label: "Gecikme : X"
  if (latencyMs === null) {
    const gLine = lines.find(l => /^\s*Gecikme\s*:/i.test(l));
    if (gLine) { const m = gLine.match(/:\s*([0-9.,]+)/); if (m) latencyMs = parseFloat(m[1]); }
  }

  return { deviceName, vpnName, upValue, upUnit, downValue, downUnit, latencyMs };
}
