/**
 * types.ts — Utility Function Tests
 * ===================================
 * fmt, getBestDownload, getBestUpload, getMarkerColor, getQualityClass, getQualityLabel
 */

import { describe, it, expect } from 'vitest';
import { fmt, getBestDownload, getBestUpload, getMarkerColor, getQualityClass, getQualityLabel } from '../types';
import type { Mission } from '../types';

// ─── Mock Mission Factory ───────────────────────────────────────────────────

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 1, name: 'TEST', city: null, country: null, continent: null,
  lat: 39.9, lon: 32.8,
  ...overrides,
});

// ─── fmt ────────────────────────────────────────────────────────────────────

describe('fmt', () => {
  it('formats number with default 2 decimals', () => {
    expect(fmt(50.123)).toBe('50.12');
  });

  it('formats number with custom decimals', () => {
    expect(fmt(50.123, 1)).toBe('50.1');
    expect(fmt(50.123, 0)).toBe('50');
  });

  it('returns "0.00" for null/undefined', () => {
    expect(fmt(null)).toBe('0.00');
    expect(fmt(undefined)).toBe('0.00');
  });

  it('returns "0.00" for non-finite values', () => {
    expect(fmt(NaN)).toBe('0.00');
    expect(fmt(Infinity)).toBe('0.00');
  });

  it('handles zero', () => {
    expect(fmt(0)).toBe('0.00');
  });

  it('handles string numbers', () => {
    expect(fmt('42.5')).toBe('42.50');
  });
});

// ─── getBestDownload ────────────────────────────────────────────────────────

describe('getBestDownload', () => {
  it('returns GSM download when larger', () => {
    expect(getBestDownload(makeMission({ gsm_download: 50, metro_download: 30 }))).toBe(50);
  });

  it('returns METRO download when larger', () => {
    expect(getBestDownload(makeMission({ gsm_download: 20, metro_download: 80 }))).toBe(80);
  });

  it('returns 0 when both null', () => {
    expect(getBestDownload(makeMission({ gsm_download: null, metro_download: null }))).toBe(0);
  });

  it('returns 0 when both undefined', () => {
    expect(getBestDownload(makeMission({}))).toBe(0);
  });
});

// ─── getBestUpload ──────────────────────────────────────────────────────────

describe('getBestUpload', () => {
  it('returns max of GSM and METRO upload', () => {
    expect(getBestUpload(makeMission({ gsm_upload: 10, metro_upload: 30 }))).toBe(30);
  });

  it('returns 0 when both null', () => {
    expect(getBestUpload(makeMission({ gsm_upload: null, metro_upload: null }))).toBe(0);
  });
});

// ─── getMarkerColor ─────────────────────────────────────────────────────────

describe('getMarkerColor', () => {
  it('returns green for ≥60 Mbps', () => {
    expect(getMarkerColor(makeMission({ gsm_download: 70 }))).toBe('#22c55e');
    expect(getMarkerColor(makeMission({ metro_download: 60 }))).toBe('#22c55e');
  });

  it('returns amber for ≥30 and <60 Mbps', () => {
    expect(getMarkerColor(makeMission({ gsm_download: 45 }))).toBe('#f59e0b');
    expect(getMarkerColor(makeMission({ metro_download: 30 }))).toBe('#f59e0b');
  });

  it('returns red for <30 Mbps', () => {
    expect(getMarkerColor(makeMission({ gsm_download: 10 }))).toBe('#ef4444');
  });

  it('returns red when no data (0)', () => {
    expect(getMarkerColor(makeMission({}))).toBe('#ef4444');
  });
});

// ─── getQualityClass ────────────────────────────────────────────────────────

describe('getQualityClass', () => {
  it('returns quality-excellent for ≥60', () => {
    expect(getQualityClass(80)).toBe('quality-excellent');
  });

  it('returns quality-good for ≥30', () => {
    expect(getQualityClass(45)).toBe('quality-good');
  });

  it('returns quality-poor for <30', () => {
    expect(getQualityClass(10)).toBe('quality-poor');
  });

  it('returns quality-none for null/undefined', () => {
    expect(getQualityClass(null)).toBe('quality-none');
    expect(getQualityClass(undefined)).toBe('quality-none');
  });
});

// ─── getQualityLabel ────────────────────────────────────────────────────────

describe('getQualityLabel', () => {
  it('returns "Mükemmel" for ≥60', () => {
    expect(getQualityLabel(80)).toBe('Mükemmel');
  });

  it('returns "İyi" for ≥30', () => {
    expect(getQualityLabel(45)).toBe('İyi');
  });

  it('returns "Zayıf" for <30', () => {
    expect(getQualityLabel(10)).toBe('Zayıf');
  });

  it('returns "Veri yok" for null/undefined', () => {
    expect(getQualityLabel(null)).toBe('Veri yok');
    expect(getQualityLabel(undefined)).toBe('Veri yok');
  });
});
