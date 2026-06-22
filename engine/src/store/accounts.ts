import type { PanelAccount, Platform } from '../adapters/contract.js';

interface AccountsClientLike {
  from(table: string): {
    select(columns?: string): {
      eq(col: string, val: unknown): any;
    };
  };
}

export async function listActiveAccounts(
  client: AccountsClientLike,
  platform: Platform,
  country: string,
): Promise<PanelAccount[]> {
  const { data, error } = await client
    .from('accounts')
    .select('id, handle, platform, industry, country, active')
    .eq('platform', platform)
    .eq('country', country)
    .eq('active', true);
  if (error) throw new Error(`listActiveAccounts failed: ${error.message}`);
  return (data ?? []) as PanelAccount[];
}
