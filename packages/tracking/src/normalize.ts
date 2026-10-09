import type { CanonicalStatus, Precision, TrackingEvent } from './view-types.ts';

/** What a carrier webhook gives us, reduced to the fields we use. */
export interface RawCarrierEvent {
  awb: string;
  code: string;
  ts: string;
  location?: string;
}

export interface CarrierMapping {
  carrier: string;
  /** Carrier status code (upper case) to our status. */
  statuses: Record<string, CanonicalStatus>;
  /** Carrier location code (upper case) to a known node. */
  locations: Record<string, { nodeId: string; precision: Precision }>;
}

/** Supplied by the caller. The AWB is looked up to a shipmentId before this point and never leaves it. */
export interface NormalizeContext {
  shipmentId: string;
  receivedAt: string;
  id?: string;
}

/** Sample mapping for a fictional carrier. */
export const demoexMapping: CarrierMapping = {
  carrier: 'DEMOEX',
  statuses: {
    BKD: 'CREATED',
    PUP: 'PICKED_UP',
    DEP: 'IN_TRANSIT',
    ARR: 'AT_HUB',
    OFD: 'OUT_FOR_DELIVERY',
    DLV: 'DELIVERED',
    UD: 'ATTEMPT_FAILED',
    RTO: 'RTO_INITIATED',
    RTD: 'RTO_DELIVERED',
  },
  locations: {
    PNQ: { nodeId: 'pune-wh', precision: 'HUB' },
    BHW: { nodeId: 'bhiwandi-hub', precision: 'HUB' },
    STV: { nodeId: 'surat-hub', precision: 'HUB' },
    IDR: { nodeId: 'indore-hub', precision: 'HUB' },
  },
};

/** Small non-cryptographic hash (FNV-1a), enough for a stable event id. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function normalizeCarrierEvent(
  raw: RawCarrierEvent,
  mapping: CarrierMapping,
  ctx: NormalizeContext,
): TrackingEvent {
  const t = Date.parse(raw.ts);
  if (Number.isNaN(t)) throw new RangeError('Carrier event has an invalid timestamp');
  const codeKey = raw.code.trim().toUpperCase();
  // hasOwn so that a code such as "constructor" cannot hit the prototype.
  const status = Object.hasOwn(mapping.statuses, codeKey) ? mapping.statuses[codeKey]! : 'EXCEPTION';
  const locKey = raw.location?.trim().toUpperCase();
  const loc = locKey && Object.hasOwn(mapping.locations, locKey) ? mapping.locations[locKey] : undefined;
  const occurredAt = new Date(t).toISOString();
  return {
    id: ctx.id ?? `evt-${fnv(`${ctx.shipmentId}|${mapping.carrier}|${raw.code}|${occurredAt}|${locKey ?? ''}`)}`,
    shipmentId: ctx.shipmentId,
    status,
    carrierCode: raw.code,
    occurredAt,
    receivedAt: ctx.receivedAt,
    ...(loc ? { nodeId: loc.nodeId } : {}),
    precision: loc ? loc.precision : 'NONE',
    source: 'carrier',
  };
}
