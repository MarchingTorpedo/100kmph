import { canonicalStatuses } from './view-types.ts';
import type { CanonicalStatus, StepKey, TrackingEvent, TrackingNode, TrackingView } from './view-types.ts';

export interface BuildTrackingViewInput {
  shipmentRef: string;
  events: TrackingEvent[];
  nodes: TrackingNode[];
  /** Ordered node ids, origin to destination. */
  route: string[];
  /** ISO. The promised delivery date. */
  promisedBy: string;
  handler?: { firstName: string; role: string } | null;
  /** ISO. Passed in so the output is deterministic. */
  now: string;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const IST_OFFSET = 330 * MIN;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isTerminal = (s: CanonicalStatus): boolean => s === 'DELIVERED' || s === 'RTO_DELIVERED';
const isReturn = (s: CanonicalStatus): boolean => s === 'RTO_INITIATED' || s === 'RTO_DELIVERED';
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

const LABELS: Record<CanonicalStatus, string> = {
  CREATED: 'Order confirmed',
  AT_WAREHOUSE: 'Packed at the warehouse',
  PICKED_UP: 'Picked up by the carrier',
  IN_TRANSIT: 'In transit',
  AT_HUB: 'Arrived at a hub',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  ATTEMPT_FAILED: 'Delivery attempt did not complete',
  RTO_INITIATED: 'Returning to the seller',
  RTO_DELIVERED: 'Returned to the seller',
  EXCEPTION: 'Update in progress',
};

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'ordered', label: 'Ordered' },
  { key: 'packed', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'delivered', label: 'Delivered' },
];

/** Index of the step that is "current" once a status is reached. 6 means all done. RTO and EXCEPTION say nothing about progress. */
const STAGE: Partial<Record<CanonicalStatus, number>> = {
  CREATED: 1,
  AT_WAREHOUSE: 2,
  PICKED_UP: 3,
  IN_TRANSIT: 3,
  AT_HUB: 3,
  OUT_FOR_DELIVERY: 4,
  ATTEMPT_FAILED: 4,
  DELIVERED: 6,
};

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

function duration(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? plural(hours, 'hour') : plural(Math.floor(hours / 24), 'day');
}

/** Calendar dates are shown in India time (IST, UTC+5:30). */
function istDay(ms: number): { d: number; m: string } {
  const date = new Date(ms + IST_OFFSET);
  return { d: date.getUTCDate(), m: MONTHS[date.getUTCMonth()] ?? '' };
}

function windowLabel(fromMs: number, toMs: number): string {
  const a = istDay(fromMs);
  const b = istDay(toMs);
  return a.m === b.m ? `Expected ${a.d} to ${b.d} ${b.m}` : `Expected ${a.d} ${a.m} to ${b.d} ${b.m}`;
}

interface Prepared {
  e: TrackingEvent;
  t: number;
}

/** Order by occurredAt, drop duplicates, and stop at the first terminal event. Input order never matters. */
function prepare(events: TrackingEvent[]): Prepared[] {
  const rank = new Map<string, number>(canonicalStatuses.map((s, i) => [s, i]));
  const cmp = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0);
  const sorted = events
    .map((e) => ({ e, t: Date.parse(e.occurredAt) }))
    .filter((p) => !Number.isNaN(p.t))
    .sort(
      (a, b) =>
        cmp(a.t, b.t) ||
        cmp(rank.get(a.e.status) ?? 0, rank.get(b.e.status) ?? 0) ||
        cmp(a.e.carrierCode, b.e.carrierCode) ||
        cmp(a.e.nodeId ?? '', b.e.nodeId ?? '') ||
        cmp(a.e.id, b.e.id),
    );
  const seen = new Set<string>();
  const out: Prepared[] = [];
  for (const p of sorted) {
    const key = `${p.e.status}|${p.e.carrierCode}|${p.t}|${p.e.nodeId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    // Anything after a terminal state is a late or stray event and must not move the shipment.
    if (isTerminal(p.e.status)) break;
  }
  return out;
}

export function buildTrackingView(input: BuildTrackingViewInput): TrackingView {
  const nowMs = Date.parse(input.now);
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const routeNodes = input.route.flatMap((id) => {
    const n = nodeById.get(id);
    return n ? [n] : [];
  });
  const events = prepare(input.events);
  const last = events[events.length - 1];

  // Status: the newest event wins, except that once a return starts it stays a return.
  let status: CanonicalStatus = 'CREATED';
  let returning = false;
  const labels: string[] = [];
  for (const { e } of events) {
    const afterReturn = returning && !isReturn(e.status) && e.status !== 'EXCEPTION';
    if (e.status === 'RTO_INITIATED') returning = true;
    labels.push(afterReturn ? `${LABELS[e.status]} (return)` : LABELS[e.status]);
    status = returning && !isTerminal(e.status) ? 'RTO_INITIATED' : e.status;
  }
  const terminal = isTerminal(status);

  // Freshness
  const lastMs = last ? last.t : nowMs;
  const ageMinutes = Math.max(0, Math.floor((nowMs - lastMs) / MIN));
  const level = terminal || ageMinutes * MIN < 6 * HOUR ? 'fresh' : ageMinutes * MIN < DAY ? 'aging' : 'stale';
  const agoText = ageMinutes < 1 ? 'just now' : `${duration(ageMinutes)} ago`;

  // Position: only ever from the latest event that has one.
  let current: TrackingView['route']['current'] = null;
  for (let i = events.length - 1; i >= 0 && !current; i--) {
    const e = events[i]!.e;
    const node = e.nodeId ? nodeById.get(e.nodeId) : undefined;
    const lat = e.lat ?? node?.lat;
    const lng = e.lng ?? node?.lng;
    if (lat === undefined || lng === undefined) continue;
    const label = node ? node.name : e.precision === 'GPS' ? 'Last GPS position' : 'Last known position';
    current = { ...(node ? { nodeId: node.id } : {}), lat, lng, precision: e.precision, label };
  }

  // Nodes up to the furthest scanned one count as reached, even if a hub scan was skipped.
  let furthest = -1;
  for (const { e } of events) {
    const idx = routeNodes.findIndex((n) => n.id === e.nodeId);
    if (idx > furthest) furthest = idx;
  }
  if (status === 'DELIVERED') furthest = routeNodes.length - 1;
  const moving = status === 'IN_TRANSIT' || status === 'PICKED_UP' || status === 'OUT_FOR_DELIVERY';
  const from = routeNodes[furthest];
  const to = routeNodes[furthest + 1];
  const estimatedLeg =
    moving && last?.e.precision !== 'GPS' && from && to ? { fromNodeId: from.id, toNodeId: to.id } : null;

  // Steps
  const stages = events.map(({ e }) => STAGE[e.status]);
  const known = stages.filter((s): s is number => s !== undefined);
  const idx = known.length === 0 ? 1 : returning ? Math.max(...known) : known[known.length - 1]!;
  // A returning parcel keeps the steps it really passed; delivery steps go back to upcoming.
  const lastDone = returning ? (idx >= 3 ? 3 : idx - 1) : idx - 1;
  const steps = STEPS.map(({ key, label }, i): TrackingView['steps'][number] => {
    const state = i <= lastDone ? 'done' : !returning && i === idx ? 'current' : 'upcoming';
    const at = state === 'done' ? events.find((_, n) => (stages[n] ?? -1) > i)?.e.occurredAt : undefined;
    return { key, label, state, ...(at ? { at: iso(Date.parse(at)) } : {}) };
  });

  // ETA
  const promisedMs = Date.parse(input.promisedBy);
  const eta =
    Number.isNaN(promisedMs) || status === 'DELIVERED' || isReturn(status)
      ? null
      : (() => {
          const toMs = level === 'stale' ? promisedMs + DAY : promisedMs;
          const fromMs = promisedMs - DAY;
          return { from: iso(fromMs), to: iso(toMs), label: windowLabel(fromMs, toMs) };
        })();

  // Handler: shown, and callable, only while out for delivery.
  const firstName = input.handler?.firstName.trim().split(/\s+/)[0] ?? '';
  const handler =
    status === 'OUT_FOR_DELIVERY' && input.handler && firstName
      ? { firstName, role: input.handler.role, call: { enabled: true } }
      : null;

  const notices: string[] = [];
  if (level === 'stale') notices.push(`No scan for ${duration(ageMinutes)}. We are checking with the carrier.`);
  if (status === 'ATTEMPT_FAILED') notices.push('Delivery was attempted but did not complete.');
  if (status === 'EXCEPTION') notices.push('An update is in progress.');
  if (status === 'RTO_INITIATED') notices.push('This parcel is on its way back to the seller.');
  if (status === 'RTO_DELIVERED') notices.push('This parcel has been returned to the seller.');

  const place = last?.e.nodeId ? nodeById.get(last.e.nodeId)?.name : undefined;
  const day = last ? istDay(last.t) : undefined;
  const summary =
    status === 'DELIVERED' && day
      ? `Delivered${place ? ` at ${place}` : ''} on ${day.d} ${day.m}.`
      : status === 'RTO_DELIVERED' && day
        ? `Returned to the seller on ${day.d} ${day.m}.`
        : place
          ? `Last scanned at ${place}, ${agoText}.`
          : `Last update ${agoText}.`;

  const timeline = events
    .map(({ e }, i) => {
      const name = e.nodeId ? nodeById.get(e.nodeId)?.name : undefined;
      return { at: iso(Date.parse(e.occurredAt)), label: labels[i] ?? '', ...(name ? { place: name } : {}), precision: e.precision };
    })
    .reverse();

  return {
    shipmentRef: input.shipmentRef,
    status,
    headline: LABELS[status],
    summary,
    freshness: {
      lastEventAt: iso(lastMs),
      ageMinutes,
      label: ageMinutes < 1 ? 'Updated just now' : `Updated ${agoText}`,
      level,
    },
    eta,
    steps,
    route: {
      nodes: routeNodes.map((n, i) => ({ ...n, reached: i <= furthest })),
      current,
      estimatedLeg,
    },
    timeline,
    handler,
    notices,
    terminal,
  };
}
