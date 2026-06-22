import { describe, it, expect } from 'vitest';
import { listActiveAccounts } from './accounts.js';

// Fake the supabase query builder chain: from().select().eq().eq().eq()
function fakeClient(rows: any[]) {
  const filters: any[] = [];
  const builder: any = {
    select() { return builder; },
    eq(col: string, val: unknown) { filters.push([col, val]); return builder; },
    then(resolve: (v: any) => void) { resolve({ data: rows, error: null }); },
  };
  return { filters, from: () => builder };
}

describe('listActiveAccounts', () => {
  it('filters by platform, country, active and maps rows', async () => {
    const c = fakeClient([
      { id: 'a1', handle: 'h', platform: 'instagram', industry: 'beauty', country: 'SE', active: true },
    ]);
    const accounts = await listActiveAccounts(c as any, 'instagram', 'SE');
    expect(c.filters).toEqual([['platform', 'instagram'], ['country', 'SE'], ['active', true]]);
    expect(accounts[0]).toMatchObject({ id: 'a1', industry: 'beauty' });
  });
});
