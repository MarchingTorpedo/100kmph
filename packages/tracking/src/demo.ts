// Synthetic scenarios only: fictional refs, fictional handlers, approximate city coordinates.
import { buildTrackingView } from './build-view.ts';
import type { BuildTrackingViewInput } from './build-view.ts';
import { demoScenarioNames } from './view-types.ts';
import type { CanonicalStatus, DemoScenarioName, Precision, TrackingEvent, TrackingNode, TrackingView } from './view-types.ts';

export const DEMO_NOW = '2026-10-12T10:00:00Z';

const node = (id: string, name: string, city: string, lat: number, lng: number, type: TrackingNode['type']): TrackingNode => ({
  id, name, city, lat, lng, type,
});

const N = {
  pune: node('pune-wh', 'Pune warehouse', 'Pune', 18.5204, 73.8567, 'warehouse'),
  bhiwandi: node('bhiwandi-hub', 'Bhiwandi hub', 'Bhiwandi', 19.2813, 73.0483, 'hub'),
  surat: node('surat-hub', 'Surat hub', 'Surat', 21.1702, 72.8311, 'hub'),
  indore: node('indore-hub', 'Indore hub', 'Indore', 22.7196, 75.8577, 'hub'),
  delhi: node('delhi-ncr-hub', 'Delhi NCR hub', 'Gurugram', 28.4595, 77.0266, 'hub'),
  jaipurHub: node('jaipur-hub', 'Jaipur hub', 'Jaipur', 26.9124, 75.7873, 'hub'),
  jaipurDel: node('jaipur-delivery', 'Jaipur delivery station', 'Jaipur', 26.8851, 75.8049, 'delivery'),
  lucknowDel: node('lucknow-delivery', 'Lucknow delivery station', 'Lucknow', 26.8467, 80.9462, 'delivery'),
  hydHub: node('hyderabad-hub', 'Hyderabad hub', 'Hyderabad', 17.385, 78.4867, 'hub'),
  hydDel: node('hyderabad-delivery', 'Hyderabad delivery station', 'Hyderabad', 17.4399, 78.4983, 'delivery'),
  kalyanDel: node('kalyan-delivery', 'Kalyan delivery station', 'Kalyan', 19.2403, 73.1305, 'delivery'),
};

type Step = [status: CanonicalStatus, code: string, at: string, node?: TrackingNode, precision?: Precision];

function events(scenario: string, steps: Step[]): TrackingEvent[] {
  return steps.map(([status, code, at, n, precision], i) => ({
    id: `evt-${scenario}-${i + 1}`,
    shipmentId: `shp-${scenario}`,
    status,
    carrierCode: code,
    occurredAt: at,
    receivedAt: new Date(Date.parse(at) + 2 * 60_000).toISOString().replace('.000Z', 'Z'),
    ...(n ? { nodeId: n.id } : {}),
    precision: precision ?? (n ? 'HUB' : 'NONE'),
    source: 'carrier',
  }));
}

const input = (
  scenario: string,
  nodes: TrackingNode[],
  promisedBy: string,
  steps: Step[],
  handler?: BuildTrackingViewInput['handler'],
): BuildTrackingViewInput => ({
  shipmentRef: `demo-${scenario}-x7k2`,
  events: events(scenario, steps),
  nodes,
  route: nodes.map((n) => n.id),
  promisedBy,
  handler: handler ?? null,
  now: DEMO_NOW,
});

export const demoScenarios: Record<DemoScenarioName, BuildTrackingViewInput> = {
  'on-time': input('on-time', [N.pune, N.bhiwandi, N.surat, N.indore, N.jaipurDel], '2026-10-15T12:00:00Z', [
    ['CREATED', 'BKD', '2026-10-10T04:00:00Z'],
    ['PICKED_UP', 'PUP', '2026-10-10T13:00:00Z', N.pune],
    ['AT_HUB', 'ARR', '2026-10-11T02:30:00Z', N.bhiwandi],
    ['IN_TRANSIT', 'DEP', '2026-10-11T05:00:00Z', N.bhiwandi],
    ['AT_HUB', 'ARR', '2026-10-11T19:00:00Z', N.surat],
    ['IN_TRANSIT', 'DEP', '2026-10-12T07:00:00Z', N.surat],
  ]),
  'out-for-delivery': input(
    'out-for-delivery',
    [N.pune, N.hydHub, N.hydDel],
    '2026-10-12T18:00:00Z',
    [
      ['CREATED', 'BKD', '2026-10-09T05:00:00Z'],
      ['PICKED_UP', 'PUP', '2026-10-09T12:00:00Z', N.pune],
      ['AT_HUB', 'ARR', '2026-10-11T16:00:00Z', N.hydHub],
      ['OUT_FOR_DELIVERY', 'OFD', '2026-10-12T05:30:00Z', N.hydHub],
    ],
    { firstName: 'Ravi', role: 'Delivery partner' },
  ),
  delayed: input('delayed', [N.pune, N.bhiwandi, N.surat, N.indore, N.delhi, N.lucknowDel], '2026-10-12T12:00:00Z', [
    ['CREATED', 'BKD', '2026-10-08T04:00:00Z'],
    ['PICKED_UP', 'PUP', '2026-10-08T14:00:00Z', N.pune],
    ['AT_HUB', 'ARR', '2026-10-09T08:00:00Z', N.bhiwandi],
    ['IN_TRANSIT', 'DEP', '2026-10-09T20:00:00Z', N.bhiwandi],
    ['AT_HUB', 'ARR', '2026-10-10T18:00:00Z', N.surat],
    ['IN_TRANSIT', 'DEP', '2026-10-11T07:30:00Z', N.indore],
  ]),
  'failed-attempt': input(
    'failed-attempt',
    [N.pune, N.jaipurHub, N.jaipurDel],
    '2026-10-12T18:00:00Z',
    [
      ['CREATED', 'BKD', '2026-10-08T05:00:00Z'],
      ['PICKED_UP', 'PUP', '2026-10-08T12:00:00Z', N.pune],
      ['AT_HUB', 'ARR', '2026-10-11T14:00:00Z', N.jaipurHub],
      ['OUT_FOR_DELIVERY', 'OFD', '2026-10-12T03:30:00Z', N.jaipurHub],
      ['ATTEMPT_FAILED', 'UD', '2026-10-12T07:00:00Z', N.jaipurDel],
    ],
    // Supplied on purpose: the view must still hide it after a failed attempt.
    { firstName: 'Meera', role: 'Delivery partner' },
  ),
  delivered: input('delivered', [N.pune, N.bhiwandi, N.kalyanDel], '2026-10-12T12:00:00Z', [
    ['CREATED', 'BKD', '2026-10-09T05:00:00Z'],
    ['PICKED_UP', 'PUP', '2026-10-09T11:00:00Z', N.pune],
    ['AT_HUB', 'ARR', '2026-10-10T08:00:00Z', N.bhiwandi],
    ['OUT_FOR_DELIVERY', 'OFD', '2026-10-11T04:00:00Z', N.bhiwandi],
    ['DELIVERED', 'DLV', '2026-10-11T10:30:00Z', N.kalyanDel],
  ]),
  returning: input('returning', [N.pune, N.bhiwandi, N.surat, N.indore], '2026-10-11T12:00:00Z', [
    ['CREATED', 'BKD', '2026-10-07T05:00:00Z'],
    ['PICKED_UP', 'PUP', '2026-10-07T12:00:00Z', N.pune],
    ['AT_HUB', 'ARR', '2026-10-08T09:00:00Z', N.bhiwandi],
    ['IN_TRANSIT', 'DEP', '2026-10-08T20:00:00Z', N.surat],
    ['ATTEMPT_FAILED', 'UD', '2026-10-10T09:00:00Z', N.indore],
    ['RTO_INITIATED', 'RTO', '2026-10-11T12:00:00Z', N.indore],
    ['IN_TRANSIT', 'DEP', '2026-10-12T06:00:00Z', N.indore],
  ]),
};

export function buildDemoView(name: DemoScenarioName): TrackingView {
  return buildTrackingView(demoScenarios[name]);
}

