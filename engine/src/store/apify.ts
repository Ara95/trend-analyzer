import { ApifyClient } from 'apify-client';
import type { ActorRunner } from '../adapters/contract.js';

// Minimal structural shape of the parts of ApifyClient we use (keeps tests simple).
interface ApifyLike {
  actor(actorId: string): { call(input: unknown): Promise<{ defaultDatasetId: string }> };
  dataset(id: string): { listItems(): Promise<{ items: unknown[] }> };
}

export function makeActorRunner(client: ApifyLike): ActorRunner {
  return async (actorId, input) => {
    const run = await client.actor(actorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items;
  };
}

export function createApify(token: string): ActorRunner {
  return makeActorRunner(new ApifyClient({ token }) as unknown as ApifyLike);
}
