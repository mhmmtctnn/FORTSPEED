/**
 * Webhook Parser — Unit Tests
 * ===========================
 * convertToMbps, resolveVpnType, parseSpeedTestBody fonksiyonlarının
 * doğrudan birim testleri (app.ts'den bağımsız).
 */

import { convertToMbps, resolveVpnType, parseSpeedTestBody } from '../helpers/webhook-parser';

// ─── convertToMbps ──────────────────────────────────────────────────────────

describe('convertToMbps', () => {
  it('returns null for empty value/unit', () => {
    expect(convertToMbps('', 'Mbps')).toBeNull();
    expect(convertToMbps('50', '')).toBeNull();
  });

  it('returns null for NaN value', () => {
    expect(convertToMbps('abc', 'Mbps')).toBeNull();
  });

  it('parses Mbps correctly', () => {
    expect(convertToMbps('50', 'Mbps')).toBe(50);
    expect(convertToMbps('100.5', 'Mbps')).toBeCloseTo(100.5);
  });

  it('converts Gbps to Mbps (×1000)', () => {
    expect(convertToMbps('1.5', 'Gbps')).toBe(1500);
    expect(convertToMbps('2', 'Gbps')).toBe(2000);
  });

  it('converts Kbps to Mbps (÷1000)', () => {
    expect(convertToMbps('5000', 'Kbps')).toBeCloseTo(5);
    expect(convertToMbps('20000', 'Kbps')).toBeCloseTo(20);
  });

  it('converts bps to Mbps (÷1000000)', () => {
    expect(convertToMbps('5000000', 'bps')).toBeCloseTo(5);
  });

  it('handles comma as decimal separator', () => {
    expect(convertToMbps('48,5', 'Mbps')).toBeCloseTo(48.5);
  });

  it('handles various Mbps spellings', () => {
    expect(convertToMbps('50', 'mbit/s')).toBe(50);
    expect(convertToMbps('50', 'Mbit/s')).toBe(50);
    expect(convertToMbps('50', 'mbits/sec')).toBe(50);
  });

  it('handles various Gbps spellings', () => {
    expect(convertToMbps('1', 'gbit/s')).toBe(1000);
    expect(convertToMbps('1', 'Gbit/sec')).toBe(1000);
    expect(convertToMbps('1', 'gigabits/sec')).toBe(1000);
  });

  it('falls back to assuming Mbps for unknown unit', () => {
    expect(convertToMbps('77', 'unknown')).toBe(77);
  });

  it('handles whitespace in value and unit', () => {
    expect(convertToMbps(' 50 ', ' Mbps ')).toBe(50);
  });
});

// ─── resolveVpnType ─────────────────────────────────────────────────────────

describe('resolveVpnType', () => {
  it('returns METRO for null', () => {
    expect(resolveVpnType(null)).toBe('METRO');
  });

  it('returns GSM for GSM keyword', () => {
    expect(resolveVpnType('GSM-LINK')).toBe('GSM');
  });

  it('returns GSM for LTE keyword', () => {
    expect(resolveVpnType('LTE-LINK')).toBe('GSM');
  });

  it('returns GSM for 4G/5G keywords', () => {
    expect(resolveVpnType('4G-VPN')).toBe('GSM');
    expect(resolveVpnType('5G-Connection')).toBe('GSM');
  });

  it('returns GSM for Cell/Mobile keywords', () => {
    expect(resolveVpnType('Cell-VPN')).toBe('GSM');
    expect(resolveVpnType('Mobile-Link')).toBe('GSM');
  });

  it('returns METRO for METRO keyword', () => {
    expect(resolveVpnType('METRO-LINK')).toBe('METRO');
  });

  it('returns METRO for MPLS/Fiber keyword', () => {
    expect(resolveVpnType('MPLS-VPN')).toBe('METRO');
    expect(resolveVpnType('Fiber-Link')).toBe('METRO');
  });

  it('returns METRO for Karasal keyword', () => {
    expect(resolveVpnType('Karasal-VPN')).toBe('METRO');
  });

  it('returns METRO for unknown VPN name', () => {
    expect(resolveVpnType('UNKNOWN-VPN')).toBe('METRO');
  });
});

// ─── parseSpeedTestBody ─────────────────────────────────────────────────────

describe('parseSpeedTestBody', () => {
  it('parses FortiGate CLI format', () => {
    const body = 'BERLIN-BK execute speed-test-ipsec METRO-LINK\nclient(sender): up_speed: 48.5 Mbps\nclient(recver): down_speed: 96.2 Mbps';
    const result = parseSpeedTestBody(body);
    expect(result.deviceName).toBe('BERLIN-BK');
    expect(result.vpnName).toBe('METRO-LINK');
    expect(result.upValue).toBe('48.5');
    expect(result.upUnit).toBe('Mbps');
    expect(result.downValue).toBe('96.2');
    expect(result.downUnit).toBe('Mbps');
  });

  it('parses Türkçe label format', () => {
    const body = 'Cihaz Adı: ANKARA-BK\nVPN Adı: METRO-VPN\nUpload Hızı: 25 Mbps\nDownload Hızı: 80 Mbps';
    const result = parseSpeedTestBody(body);
    expect(result.deviceName).toBe('ANKARA-BK');
    expect(result.vpnName).toBe('METRO-VPN');
    expect(result.upValue).toBe('25');
    expect(result.downValue).toBe('80');
  });

  it('returns null fields for empty/minimal input', () => {
    const result = parseSpeedTestBody('');
    expect(result.deviceName).toBeNull();
    expect(result.vpnName).toBeNull();
    expect(result.upValue).toBeNull();
    expect(result.downValue).toBeNull();
  });

  it('parses only download when upload is missing', () => {
    const body = 'HAMBURG-BK execute speed-test-ipsec METRO\nclient(recver): down_speed: 77 Mbps';
    const result = parseSpeedTestBody(body);
    expect(result.deviceName).toBe('HAMBURG-BK');
    expect(result.downValue).toBe('77');
    expect(result.upValue).toBeNull();
  });

  it('parses Gbps units', () => {
    const body = 'MUNIH-BK execute speed-test-ipsec FIBER\nclient(sender): up_speed: 1.5 Gbps\nclient(recver): down_speed: 2.0 Gbps';
    const result = parseSpeedTestBody(body);
    expect(result.upValue).toBe('1.5');
    expect(result.upUnit).toBe('Gbps');
    expect(result.downValue).toBe('2.0');
    expect(result.downUnit).toBe('Gbps');
  });

  it('parses generic key: value fallback', () => {
    const body = 'upload_speed: 30 Mbps\ndownload_speed: 90 Mbps';
    const result = parseSpeedTestBody(body);
    expect(result.upValue).toBe('30');
    expect(result.downValue).toBe('90');
  });
});
