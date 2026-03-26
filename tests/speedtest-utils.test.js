const { fixSpeed, fixDate, parseCoord } = require('../speedtest-utils');

// ─── fixSpeed ────────────────────────────────────────────────────────────────

describe('fixSpeed', () => {
  it('returns null for NULL string', () => {
    expect(fixSpeed('NULL')).toBeNull();
  });

  it('returns null for N/A string', () => {
    expect(fixSpeed('N/A')).toBeNull();
  });

  it('returns null for empty/undefined', () => {
    expect(fixSpeed('')).toBeNull();
    expect(fixSpeed(null)).toBeNull();
    expect(fixSpeed(undefined)).toBeNull();
  });

  it('returns number for plain numeric string', () => {
    expect(fixSpeed('25.5')).toBe(25.5);
    expect(fixSpeed('100')).toBe(100);
  });

  it('fixes Turkish month at start: Oca.20 → 1.20', () => {
    expect(fixSpeed('Oca.20')).toBeCloseTo(1.2);
  });

  it('fixes Turkish month at start: Nis.47 → 4.47', () => {
    expect(fixSpeed('Nis.47')).toBeCloseTo(4.47);
  });

  it('fixes Turkish month at end: 22.Eki → 22.10', () => {
    expect(fixSpeed('22.Eki')).toBeCloseTo(22.1);
  });

  it('fixes Turkish month Şub.35 → 2.35', () => {
    expect(fixSpeed('Şub.35')).toBeCloseTo(2.35);
  });

  it('fixes Turkish month Ara.15 → 12.15', () => {
    expect(fixSpeed('Ara.15')).toBeCloseTo(12.15);
  });

  it('fixes Turkish month 10.Kas → 10.11', () => {
    expect(fixSpeed('10.Kas')).toBeCloseTo(10.11);
  });

  it('returns null for non-numeric after substitution', () => {
    expect(fixSpeed('abc')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(fixSpeed('  25.5  ')).toBe(25.5);
  });
});

// ─── fixDate ────────────────────────────────────────────────────────────────

describe('fixDate', () => {
  it('returns null for NULL string', () => {
    expect(fixDate('NULL')).toBeNull();
  });

  it('returns null for undefined/null', () => {
    expect(fixDate(null)).toBeNull();
    expect(fixDate(undefined)).toBeNull();
  });

  it('parses DD.MM.YYYY HH:MM format', () => {
    expect(fixDate('19.08.2025 15:18')).toBe('2025-08-19T15:18:00');
  });

  it('parses DD.MM.YYYY HH:MM:SS format', () => {
    expect(fixDate('01.01.2024 00:00:30')).toBe('2024-01-01T00:00:30');
  });

  it('parses midnight correctly', () => {
    expect(fixDate('15.03.2025 00:00')).toBe('2025-03-15T00:00:00');
  });

  it('returns string as-is if already valid ISO', () => {
    expect(fixDate('2025-08-19T15:18:00')).toBe('2025-08-19T15:18:00');
  });

  it('handles whitespace around date', () => {
    expect(fixDate('  19.08.2025 15:18  ')).toBe('2025-08-19T15:18:00');
  });
});

// ─── parseCoord ─────────────────────────────────────────────────────────────

describe('parseCoord', () => {
  it('returns null for NULL string', () => {
    expect(parseCoord('NULL')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCoord('')).toBeNull();
    expect(parseCoord('  ')).toBeNull();
  });

  it('returns null for undefined/null', () => {
    expect(parseCoord(null)).toBeNull();
    expect(parseCoord(undefined)).toBeNull();
  });

  it('parses standard latitude', () => {
    expect(parseCoord('39.909854')).toBeCloseTo(39.909854);
  });

  it('parses negative coordinate', () => {
    expect(parseCoord('-18.84918')).toBeCloseTo(-18.84918);
  });

  it('parses longitude > 100', () => {
    expect(parseCoord('114.960423')).toBeCloseTo(114.960423);
  });

  it('parses small decimal', () => {
    expect(parseCoord('4.88276')).toBeCloseTo(4.88276);
  });

  it('returns null for non-numeric', () => {
    expect(parseCoord('abc')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(parseCoord('  32.762773  ')).toBeCloseTo(32.762773);
  });
});
