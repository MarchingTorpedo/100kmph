import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildTrackingView,
  demoScenarioNames,
  demoScenarios,
  buildDemoView,
  DEMO_NOW,
  normalizeCarrierEvent,
  demoexMapping,
} from '../src/index.ts';
import type { BuildTrackingViewInput, CanonicalStatus, TrackingEvent, TrackingNode, TrackingView } from '../src/index.ts';

const NOW = '2026-10-12T10:00:00Z';
const nodes: TrackingNode[] = [
  { id: 'a', name: 'Alpha warehouse', city: 'Pune', lat: 18.5, lng: 73.8, type: 'warehouse' },
  { id: 'b', name: 'Bravo hub', city: 'Surat', lat: 21.1, lng: 72.8, type: 'hub' },
  { id: 'c', name: 'Charlie hub', city: 'Indore', lat: 22.7, lng: 75.8, type: 'hub' },
  { id: 'd', name: 'Delta station', city: 'Jaipur', lat: 26.9, lng: 75.8, type: 'delivery' },
];
const hoursBefore = (h: number, m = 0): string => new Date(Date.parse(NOW) - (h * 60 + m) * 60_000).toISOString();

let counter = 0;
function ev(status: CanonicalStatus, occurredAt: string, extra: Partial<TrackingEvent> = {}): TrackingEvent {
  counter++;
  return {
    id: `e${counter}`,
    shipmentId: 's1',
    status,
    carrierCode: status.slice(0, 3),
    occurredAt,
    receivedAt: occurredAt,
    precision: 'NONE',
    source: 'carrier',
    ...extra,
  };
}
const build = (events: TrackingEvent[], over: Partial<BuildTrackingViewInput> = {}): TrackingView =>
  buildTrackingView({
    shipmentRef: 'ref',
    events,
    nodes,
    route: ['a', 'b', 'c', 'd'],
    promisedBy: '2026-10-13T08:00:00Z',
    now: NOW,
    ...over,
  });

// Seeded PRNG so the shuffle test is repeatable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(items: T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

describe('ordering and dedupe', () => {
  it('orders by occurredAt, not receivedAt', () => {
    const v = build([
      ev('IN_TRANSIT', hoursBefore(5), { receivedAt: hoursBefore(1) }),
      ev('PICKED_UP', hoursBefore(9), { receivedAt: hoursBefore(0, 30) }),
    ]);
    expect(v.status).toBe('IN_TRANSIT');
    expect(v.timeline.map((t) => t.label)).toEqual(['In transit', 'Picked up by the carrier']);
  });

  it('drops duplicates', () => {
    const e = ev('AT_HUB', hoursBefore(3), { nodeId: 'b', precision: 'HUB' });
    const v = build([e, { ...e, id: 'other', receivedAt: NOW }]);
    expect(v.timeline).toHaveLength(1);
  });

  it('gives the identical view for any order and with duplicates', () => {
    for (const name of demoScenarioNames) {
      const input = demoScenarios[name];
      const expected = buildTrackingView(input);
      const rnd = mulberry32(42 + name.length);
      for (let run = 0; run < 40; run++) {
        const dupes = input.events.filter(() => rnd() < 0.5).map((e) => ({ ...e, id: `dup-${run}-${e.id}`, receivedAt: DEMO_NOW }));
        const events = shuffled([...input.events, ...dupes], rnd);
        expect(buildTrackingView({ ...input, events })).toEqual(expected);
      }
    }
  });
});

describe('terminal states', () => {
  it('a late event does not move a delivered shipment', () => {
    const v = build([
      ev('PICKED_UP', hoursBefore(30)),
      ev('DELIVERED', hoursBefore(10), { nodeId: 'd', precision: 'HUB' }),
      ev('IN_TRANSIT', hoursBefore(2)),
      ev('ATTEMPT_FAILED', hoursBefore(1)),
    ]);
    expect(v.status).toBe('DELIVERED');
    expect(v.terminal).toBe(true);
    expect(v.timeline[0]?.label).toBe('Delivered');
    expect(v.eta).toBeNull();
  });

  it('RTO_DELIVERED is terminal too, and a late older scan does not override it', () => {
    const v = build([
      ev('RTO_INITIATED', hoursBefore(40)),
      ev('RTO_DELIVERED', hoursBefore(30)),
      ev('OUT_FOR_DELIVERY', hoursBefore(45)),
    ]);
    expect(v.status).toBe('RTO_DELIVERED');
    expect(v.freshness.level).toBe('fresh');
  });

  it('an older event never overrides a newer status', () => {
    const v = build([ev('OUT_FOR_DELIVERY', hoursBefore(2)), ev('AT_HUB', hoursBefore(8))]);
    expect(v.status).toBe('OUT_FOR_DELIVERY');
  });

  it('ATTEMPT_FAILED then OUT_FOR_DELIVERY is a valid retry', () => {
    const v = build(
      [ev('OUT_FOR_DELIVERY', hoursBefore(30)), ev('ATTEMPT_FAILED', hoursBefore(26)), ev('OUT_FOR_DELIVERY', hoursBefore(1))],
      { handler: { firstName: 'Asha', role: 'Delivery partner' } },
    );
    expect(v.status).toBe('OUT_FOR_DELIVERY');
    expect(v.handler?.firstName).toBe('Asha');
    expect(v.notices).toEqual([]);
  });
});

describe('freshness boundaries', () => {
  const level = (h: number, m: number): TrackingView['freshness'] =>
    build([ev('IN_TRANSIT', hoursBefore(h, m))]).freshness;
  it('5h59m is fresh', () => expect(level(5, 59).level).toBe('fresh'));
  it('6h is aging', () => expect(level(6, 0).level).toBe('aging'));
  it('23h59m is aging', () => expect(level(23, 59).level).toBe('aging'));
  it('24h is stale', () => expect(level(24, 0).level).toBe('stale'));
  it('labels are plain English', () => {
    expect(level(3, 10).label).toBe('Updated 3 hours ago');
    expect(level(26, 0).label).toBe('Updated 26 hours ago');
    expect(level(0, 20).label).toBe('Updated 20 minutes ago');
    expect(level(0, 0).label).toBe('Updated just now');
    expect(level(1, 0).label).toBe('Updated 1 hour ago');
  });
  it('terminal shipments are always fresh', () => {
    const v = build([ev('DELIVERED', hoursBefore(200))]);
    expect(v.freshness.level).toBe('fresh');
    expect(v.notices).toEqual([]);
  });
  it('stale shipments carry an honest notice', () => {
    expect(build([ev('IN_TRANSIT', hoursBefore(26))]).notices).toContain('No scan for 26 hours. We are checking with the carrier.');
  });
});

describe('ETA', () => {
  it('is a one day window ending at the promised time', () => {
    const v = build([ev('IN_TRANSIT', hoursBefore(2))]);
    expect(v.eta).toEqual({ from: '2026-10-12T08:00:00Z', to: '2026-10-13T08:00:00Z', label: 'Expected 12 to 13 Oct' });
  });
  it('widens by a day on the to side when stale', () => {
    const v = build([ev('IN_TRANSIT', hoursBefore(26))]);
    expect(v.eta?.from).toBe('2026-10-12T08:00:00Z');
    expect(v.eta?.to).toBe('2026-10-14T08:00:00Z');
    expect(v.eta?.label).toBe('Expected 12 to 14 Oct');
  });
  it('labels a window across months', () => {
    const v = build([ev('IN_TRANSIT', hoursBefore(2))], { promisedBy: '2026-11-01T08:00:00Z' });
    expect(v.eta?.label).toBe('Expected 31 Oct to 1 Nov');
  });
  it('is null when delivered, returning or unknown', () => {
    expect(build([ev('DELIVERED', hoursBefore(2))]).eta).toBeNull();
    expect(build([ev('RTO_INITIATED', hoursBefore(2))]).eta).toBeNull();
    expect(build([ev('RTO_DELIVERED', hoursBefore(2))]).eta).toBeNull();
    expect(build([ev('IN_TRANSIT', hoursBefore(2))], { promisedBy: 'nonsense' }).eta).toBeNull();
  });
});

describe('handler', () => {
  const handler = { firstName: 'Ravi Kumar', role: 'Delivery partner' };
  it('is shown, first name only, with call enabled while out for delivery', () => {
    const v = build([ev('OUT_FOR_DELIVERY', hoursBefore(1))], { handler });
    expect(v.handler).toEqual({ firstName: 'Ravi', role: 'Delivery partner', call: { enabled: true } });
  });
  it('is null in every other status', () => {
    const others = canonicalStatuses().filter((s) => s !== 'OUT_FOR_DELIVERY');
    for (const s of others) expect(build([ev(s, hoursBefore(1))], { handler }).handler).toBeNull();
  });
  it('is null after a failed attempt', () => {
    const v = build([ev('OUT_FOR_DELIVERY', hoursBefore(3)), ev('ATTEMPT_FAILED', hoursBefore(1))], { handler });
    expect(v.handler).toBeNull();
    expect(v.notices).toContain('Delivery was attempted but did not complete.');
  });
  it('is null when none is assigned', () => {
    expect(build([ev('OUT_FOR_DELIVERY', hoursBefore(1))]).handler).toBeNull();
  });
});

function canonicalStatuses(): CanonicalStatus[] {
  return [
    'CREATED', 'PICKED_UP', 'AT_WAREHOUSE', 'IN_TRANSIT', 'AT_HUB', 'OUT_FOR_DELIVERY',
    'DELIVERED', 'ATTEMPT_FAILED', 'RTO_INITIATED', 'RTO_DELIVERED', 'EXCEPTION',
  ];
}

describe('position', () => {
  it('has no current position before the first located event', () => {
    const v = build([ev('CREATED', hoursBefore(2))]);
    expect(v.route.current).toBeNull();
    expect(v.route.estimatedLeg).toBeNull();
  });
  it('keeps current at the last hub and estimates the next leg', () => {
    const v = build([ev('PICKED_UP', hoursBefore(9), { nodeId: 'a', precision: 'HUB' }), ev('IN_TRANSIT', hoursBefore(2), { nodeId: 'b', precision: 'HUB' })]);
    expect(v.route.current).toMatchObject({ nodeId: 'b', precision: 'HUB', label: 'Bravo hub' });
    expect(v.route.estimatedLeg).toEqual({ fromNodeId: 'b', toNodeId: 'c' });
    expect(v.route.nodes.map((n) => n.reached)).toEqual([true, true, false, false]);
  });
  it('a located event later in the route marks skipped hubs as reached', () => {
    const v = build([ev('AT_HUB', hoursBefore(2), { nodeId: 'c', precision: 'HUB' })]);
    expect(v.route.nodes.map((n) => n.reached)).toEqual([true, true, true, false]);
    expect(v.route.estimatedLeg).toBeNull();
  });
  it('passes precision through and draws no estimated leg for a fresh GPS fix', () => {
    const v = build([ev('OUT_FOR_DELIVERY', hoursBefore(1), { lat: 26.9, lng: 75.8, precision: 'GPS' })]);
    expect(v.route.current).toMatchObject({ lat: 26.9, lng: 75.8, precision: 'GPS' });
    expect(v.route.estimatedLeg).toBeNull();
  });
  it('does not invent a position from an unlocated later event', () => {
    const v = build([ev('AT_HUB', hoursBefore(5), { nodeId: 'b', precision: 'CITY' }), ev('IN_TRANSIT', hoursBefore(1))]);
    expect(v.route.current).toMatchObject({ nodeId: 'b', precision: 'CITY' });
  });
});

describe('returning and steps', () => {
  it('marks delivery steps upcoming and adds the notice', () => {
    const v = build([
      ev('PICKED_UP', hoursBefore(70), { nodeId: 'a' }),
      ev('IN_TRANSIT', hoursBefore(60), { nodeId: 'b' }),
      ev('ATTEMPT_FAILED', hoursBefore(40), { nodeId: 'd' }),
      ev('RTO_INITIATED', hoursBefore(20)),
      ev('AT_HUB', hoursBefore(2), { nodeId: 'c' }),
    ]);
    expect(v.status).toBe('RTO_INITIATED');
    expect(v.notices).toContain('This parcel is on its way back to the seller.');
    expect(v.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'upcoming', 'upcoming']);
    expect(v.timeline[0]?.label).toBe('Arrived at a hub (return)');
    expect(v.route.estimatedLeg).toBeNull();
  });
  it('treats unmapped codes as an update in progress', () => {
    const v = build([ev('IN_TRANSIT', hoursBefore(5)), ev('EXCEPTION', hoursBefore(1))]);
    expect(v.notices).toContain('An update is in progress.');
    expect(v.steps[3]?.state).toBe('current');
  });
  it('handles a shipment with no events', () => {
    const v = build([]);
    expect(v.status).toBe('CREATED');
    expect(v.timeline).toEqual([]);
  });
});

describe('normalizer', () => {
  const ctx = { shipmentId: 'shp-1', receivedAt: NOW };
  it('maps known codes and locations', () => {
    const e = normalizeCarrierEvent({ awb: 'X', code: 'arr', ts: '2026-10-12T08:00:00+05:30', location: 'bhw' }, demoexMapping, ctx);
    expect(e).toMatchObject({ status: 'AT_HUB', carrierCode: 'arr', nodeId: 'bhiwandi-hub', precision: 'HUB', occurredAt: '2026-10-12T02:30:00.000Z', shipmentId: 'shp-1', source: 'carrier' });
  });
  it('maps unknown codes to EXCEPTION and keeps the raw code', () => {
    for (const code of ['ZZ9', 'constructor', '']) {
      const e = normalizeCarrierEvent({ awb: 'X', code, ts: NOW }, demoexMapping, ctx);
      expect(e.status).toBe('EXCEPTION');
      expect(e.carrierCode).toBe(code);
      expect(e.precision).toBe('NONE');
      expect(e.nodeId).toBeUndefined();
    }
  });
  it('never carries the AWB', () => {
    const awb = 'DX48213377A';
    const e = normalizeCarrierEvent({ awb, code: 'PUP', ts: NOW, location: 'PNQ' }, demoexMapping, ctx);
    expect(JSON.stringify(e)).not.toContain(awb);
  });
  it('gives a stable id and rejects bad timestamps', () => {
    const raw = { awb: 'X', code: 'PUP', ts: NOW };
    expect(normalizeCarrierEvent(raw, demoexMapping, ctx).id).toBe(normalizeCarrierEvent(raw, demoexMapping, ctx).id);
    expect(() => normalizeCarrierEvent({ ...raw, ts: 'soon' }, demoexMapping, ctx)).toThrow(RangeError);
  });
});

describe('demo scenarios', () => {
  const rank = { done: 0, current: 1, upcoming: 2 } as const;
  const dir = new URL('../demo/', import.meta.url);

  it('use the fixed now and the six contract names', () => {
    expect(Object.keys(demoScenarios).sort()).toEqual([...demoScenarioNames].sort());
    for (const n of demoScenarioNames) expect(demoScenarios[n].now).toBe('2026-10-12T10:00:00Z');
  });

  for (const name of demoScenarioNames) {
    it(`${name}: steps are in order and monotonic`, () => {
      const v = buildDemoView(name);
      expect(v.steps.map((s) => s.key)).toEqual(['ordered', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered']);
      const ranks = v.steps.map((s) => rank[s.state]);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(v.steps.filter((s) => s.state === 'current').length).toBeLessThanOrEqual(1);
    });

    it(`${name}: committed JSON matches and has no phone-like or AWB-like strings`, () => {
      const committed = readFileSync(new URL(`${name}.json`, dir), 'utf8');
      expect(committed).toBe(`${JSON.stringify(buildDemoView(name), null, 2)}\n`);
      expect(committed).not.toMatch(/\d{8,}/); // phone numbers and numeric AWBs
      expect(committed).not.toMatch(/\+\d|tel:|\bphone\b|\bawb\b/i);
      expect(committed).not.toMatch(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{9,}\b/); // alphanumeric AWBs
    });
  }

  it('cover the intended behaviours', () => {
    expect(buildDemoView('on-time')).toMatchObject({ status: 'IN_TRANSIT', freshness: { level: 'fresh' }, handler: null });
    expect(buildDemoView('on-time').route.estimatedLeg).toEqual({ fromNodeId: 'surat-hub', toNodeId: 'indore-hub' });
    expect(buildDemoView('out-for-delivery').handler?.call.enabled).toBe(true);
    const delayed = buildDemoView('delayed');
    expect(delayed.freshness.level).toBe('stale');
    expect(delayed.notices).toHaveLength(1);
    expect(delayed.eta?.label).toBe('Expected 11 to 13 Oct');
    expect(buildDemoView('failed-attempt')).toMatchObject({ status: 'ATTEMPT_FAILED', handler: null });
    expect(buildDemoView('delivered')).toMatchObject({ status: 'DELIVERED', terminal: true, eta: null });
    expect(buildDemoView('returning')).toMatchObject({ status: 'RTO_INITIATED', eta: null });
  });
});
