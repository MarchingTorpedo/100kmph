/**
 * THE CONTRACT between the tracking core (builds a TrackingView from events)
 * and the tracking page (renders it). Change it only deliberately: both sides
 * depend on it. All timestamps are ISO 8601 strings in UTC.
 *
 * Privacy rules baked into the shape: no phone numbers, no street addresses,
 * no AWB (use the opaque `shipmentRef`), handler first name only.
 */

export const canonicalStatuses = [
  'CREATED',
  'PICKED_UP',
  'AT_WAREHOUSE',
  'IN_TRANSIT',
  'AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'ATTEMPT_FAILED',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'EXCEPTION',
] as const;
export type CanonicalStatus = (typeof canonicalStatuses)[number];

/** How exactly a position is known. Shown to the customer, never hidden. */
export type Precision = 'GPS' | 'HUB' | 'CITY' | 'NONE';

export type NodeType = 'warehouse' | 'hub' | 'delivery';

export interface TrackingNode {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  type: NodeType;
}

/** Input: one normalised event. Append-only; may arrive late, duplicated or out of order. */
export interface TrackingEvent {
  id: string;
  shipmentId: string;
  status: CanonicalStatus;
  carrierCode: string;
  occurredAt: string;
  receivedAt: string;
  nodeId?: string;
  lat?: number;
  lng?: number;
  precision: Precision;
  source: 'carrier' | 'warehouse' | 'rider' | 'manual';
}

export type StepKey = 'ordered' | 'packed' | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered';

export interface TrackingView {
  /** Opaque public id for the tracking link. Never the AWB. */
  shipmentRef: string;
  status: CanonicalStatus;
  /** Plain-language headline, e.g. "Out for delivery". */
  headline: string;
  /** One calm sentence under the headline, e.g. "Last scanned at Bhiwandi hub, 3 hours ago." */
  summary: string;
  freshness: {
    lastEventAt: string;
    ageMinutes: number;
    /** e.g. "Updated 3 hours ago" */
    label: string;
    /** fresh < 6 h, aging < 24 h, stale >= 24 h while not terminal. Terminal shipments are always 'fresh'. */
    level: 'fresh' | 'aging' | 'stale';
  };
  /** Delivery window. null when unknown, returning, or already delivered. */
  eta: { from: string; to: string; label: string } | null;
  steps: { key: StepKey; label: string; state: 'done' | 'current' | 'upcoming'; at?: string }[];
  route: {
    nodes: (TrackingNode & { reached: boolean })[];
    /** Last known position. null before the first located event. */
    current: { nodeId?: string; lat: number; lng: number; precision: Precision; label: string } | null;
    /** Leg being travelled with no position data: draw dashed, label "Estimated route". */
    estimatedLeg: { fromNodeId: string; toNodeId: string } | null;
  };
  /** Newest first. */
  timeline: { at: string; label: string; place?: string; precision: Precision }[];
  /** Present only while a handler is assigned and visible. */
  handler: { firstName: string; role: string; call: { enabled: boolean; reason?: string } } | null;
  /** Honest notices, e.g. "No scan for 26 hours. We are checking with the carrier." */
  notices: string[];
  terminal: boolean;
}

export const demoScenarioNames = [
  'on-time',
  'out-for-delivery',
  'delayed',
  'failed-attempt',
  'delivered',
  'returning',
] as const;
export type DemoScenarioName = (typeof demoScenarioNames)[number];
