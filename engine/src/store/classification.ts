import type {
  AccountClassificationWrite,
  CachedClassification,
  ContentIndustryWrite,
  IndustryVector,
  PanelAccount,
} from '../adapters/contract.js';
import { type RealIndustry } from '../config/industries.js';

export const ACCOUNT_CLASSIFICATION_CONFLICT = 'platform,account_key';
export const CONTENT_INDUSTRIES_CONFLICT = 'platform,external_id,industry';

// Loose structural client (mirrors store/accounts.ts): chainable filters resolve to {data,error}.
interface ClassificationClient {
  from(table: string): {
    select(columns?: string): any;
    upsert(rows: unknown[], opts: { onConflict: string }): Promise<{ error: { message: string } | null }>;
  };
}

// pgvector columns come back as a "[1,2,3]" string over PostgREST; accept arrays too.
function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (typeof v === 'string') {
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// Layer 1 fallback: case-insensitive panel lookup by handle (used when an account isn't pre-resolved).
export async function getPanelAccountByHandle(
  client: ClassificationClient,
  platform: string,
  handle: string,
): Promise<PanelAccount | null> {
  const { data, error } = await client
    .from('accounts')
    .select('id, handle, platform, industry, country, active')
    .eq('platform', platform)
    .ilike('handle', handle);
  if (error) throw new Error(`getPanelAccountByHandle failed: ${error.message}`);
  const row = (data ?? [])[0];
  return row ? (row as PanelAccount) : null;
}

// Layer 2: read the account_classification cache.
export async function getAccountClassification(
  client: ClassificationClient,
  platform: string,
  accountKey: string,
): Promise<CachedClassification | null> {
  const { data, error } = await client
    .from('account_classification')
    .select('labels, method, classified_at')
    .eq('platform', platform)
    .eq('account_key', accountKey);
  if (error) throw new Error(`getAccountClassification failed: ${error.message}`);
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    labels: Array.isArray(row.labels) ? row.labels : [],
    method: row.method,
    classifiedAt: row.classified_at,
  };
}

// Layer 2/3: write (cache) an account classification.
export async function upsertAccountClassification(
  client: ClassificationClient,
  row: AccountClassificationWrite,
): Promise<void> {
  const { error } = await client.from('account_classification').upsert(
    [
      {
        platform: row.platform,
        account_key: row.accountKey,
        primary_industry: row.primaryIndustry,
        labels: row.labels,
        method: row.method,
        classified_at: new Date().toISOString(),
      },
    ],
    { onConflict: ACCOUNT_CLASSIFICATION_CONFLICT },
  );
  if (error) throw new Error(`upsertAccountClassification failed: ${error.message}`);
}

// Persist per-content multi-label rows (from ingest inheritance or escalation).
export async function upsertContentIndustries(
  client: ClassificationClient,
  rows: ContentIndustryWrite[],
): Promise<void> {
  if (rows.length === 0) return;
  const classifiedAt = new Date().toISOString();
  const mapped = rows.map((r) => ({
    platform: r.platform,
    external_id: r.externalId,
    industry: r.industry,
    confidence: r.confidence,
    method: r.method,
    classified_at: classifiedAt,
  }));
  const { error } = await client
    .from('content_industries')
    .upsert(mapped, { onConflict: CONTENT_INDUSTRIES_CONFLICT });
  if (error) throw new Error(`upsertContentIndustries failed: ${error.message}`);
}

// Load the per-industry definition vectors for zero-shot comparison.
export async function loadIndustryVectors(client: ClassificationClient): Promise<IndustryVector[]> {
  const { data, error } = await client.from('industries').select('slug, embedding');
  if (error) throw new Error(`loadIndustryVectors failed: ${error.message}`);
  const out: IndustryVector[] = [];
  for (const row of (data ?? []) as { slug: string; embedding: unknown }[]) {
    if (row.slug === 'all' || row.embedding == null) continue;
    const embedding = parseVector(row.embedding);
    if (embedding.length > 0) out.push({ industry: row.slug as RealIndustry, embedding });
  }
  return out;
}

// Write one industry's definition vector (and optionally its description) — used by the
// build-industry-vectors script.
export async function upsertIndustryVector(
  client: ClassificationClient,
  slug: RealIndustry,
  embedding: number[],
  description?: string,
): Promise<void> {
  const row: Record<string, unknown> = { slug, embedding: toVectorLiteral(embedding) };
  if (description !== undefined) row.description = description;
  const { error } = await client.from('industries').upsert([row], { onConflict: 'slug' });
  if (error) throw new Error(`upsertIndustryVector failed: ${error.message}`);
}

// All current labels for a set of content, for building the escalation gates.
export interface ContentLabelRow {
  externalId: string;
  industry: string;
  confidence: number;
  method: string;
}

export async function loadContentLabels(
  client: ClassificationClient,
  externalIds: string[],
): Promise<ContentLabelRow[]> {
  if (externalIds.length === 0) return [];
  const { data, error } = await client
    .from('content_industries')
    .select('external_id, industry, confidence, method')
    .in('external_id', externalIds);
  if (error) throw new Error(`loadContentLabels failed: ${error.message}`);
  return ((data ?? []) as Record<string, any>[]).map((r) => ({
    externalId: r.external_id,
    industry: r.industry,
    confidence: typeof r.confidence === 'number' ? r.confidence : 0,
    method: r.method,
  }));
}

// Max confidence per external_id, for the escalation gate (missing → caller treats as 0).
export async function loadContentConfidence(
  client: ClassificationClient,
  externalIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (externalIds.length === 0) return out;
  const { data, error } = await client
    .from('content_industries')
    .select('external_id, confidence')
    .in('external_id', externalIds);
  if (error) throw new Error(`loadContentConfidence failed: ${error.message}`);
  for (const row of (data ?? []) as { external_id: string; confidence: number }[]) {
    const prev = out.get(row.external_id);
    const conf = typeof row.confidence === 'number' ? row.confidence : 0;
    if (prev === undefined || conf > prev) out.set(row.external_id, conf);
  }
  return out;
}
