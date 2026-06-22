import { describe, it, expect } from 'vitest';
import { parseArgs, plannedRuns } from './worker.js';

describe('parseArgs', () => {
  it('parses flags with defaults (country=SE)', () => {
    const a = parseArgs(['--source=tiktok', '--period=week']);
    expect(a).toEqual({ source: 'tiktok', country: 'SE', period: 'week' });
  });
  it('throws when source is missing', () => {
    expect(() => parseArgs(['--period=week'])).toThrow(/--source/);
  });
});

describe('plannedRuns', () => {
  it('TikTok runs week+month (no day)', () => {
    expect(plannedRuns('tiktok', undefined)).toEqual(['week', 'month']);
  });
  it('Instagram runs day+week+month', () => {
    expect(plannedRuns('instagram', undefined)).toEqual(['day', 'week', 'month']);
  });
  it('honours an explicit --period', () => {
    expect(plannedRuns('instagram', 'day')).toEqual(['day']);
  });
});
