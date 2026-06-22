import { describe, it, expect } from 'vitest';
import { makeActorRunner } from './apify.js';

function fakeApifyClient(items: unknown[]) {
  const seen: any = {};
  return {
    seen,
    actor(actorId: string) {
      seen.actorId = actorId;
      return {
        call: async (input: unknown) => { seen.input = input; return { defaultDatasetId: 'ds1' }; },
      };
    },
    dataset(id: string) {
      seen.datasetId = id;
      return { listItems: async () => ({ items }) };
    },
  };
}

describe('makeActorRunner', () => {
  it('calls the actor and returns dataset items', async () => {
    const client = fakeApifyClient([{ a: 1 }]);
    const run = makeActorRunner(client as any);
    const items = await run('some/actor', { country: 'SE' });
    expect(client.seen.actorId).toBe('some/actor');
    expect(client.seen.input).toEqual({ country: 'SE' });
    expect(client.seen.datasetId).toBe('ds1');
    expect(items).toEqual([{ a: 1 }]);
  });
});
