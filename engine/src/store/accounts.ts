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

// --- Discovery (auto-harvested accounts) ---------------------------------------------------------

interface DiscoveryClientLike {
  from(table: string): {
    select(columns?: string): {
      eq(col: string, val: unknown): Promise<{ data: { handle: string }[] | null; error: { message: string } | null }>;
    };
    upsert(rows: unknown[], opts: { onConflict: string; ignoreDuplicates: boolean }): Promise<{ error: { message: string } | null }>;
  };
}

// All handles already in the accounts table for a platform — used to skip candidates we already
// track (curated or previously discovered) so we don't re-classify them and spend model calls.
export async function listExistingHandles(
  client: DiscoveryClientLike,
  platform: string,
): Promise<Set<string>> {
  const { data, error } = await client.from('accounts').select('handle').eq('platform', platform);
  if (error) throw new Error(`listExistingHandles failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.handle.toLowerCase()));
}

export interface DiscoveredAccountRow {
  handle: string;
  platform: string;
  industry: string; // a real industry slug — discovery drops 'all'/uncertain candidates
  country: string;
}

// Insert auto-discovered accounts (discovered = true). ignoreDuplicates protects human-curated rows
// (and earlier discoveries) from being clobbered on re-runs. Returns the number of rows submitted.
export async function upsertDiscoveredAccounts(
  client: DiscoveryClientLike,
  rows: DiscoveredAccountRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const discoveredAt = new Date().toISOString();
  const mapped = rows.map((r) => ({
    handle: r.handle,
    platform: r.platform,
    industry: r.industry,
    country: r.country,
    discovered: true,
    discovered_at: discoveredAt,
  }));
  const { error } = await client
    .from('accounts')
    .upsert(mapped, { onConflict: 'platform,handle', ignoreDuplicates: true });
  if (error) throw new Error(`upsertDiscoveredAccounts failed: ${error.message}`);
  return mapped.length;
}
