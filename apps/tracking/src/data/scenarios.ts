// THE ONLY file that supplies tracking views to the pages. The views are the
// deterministic demo output of @100kmph/tracking (packages/tracking/demo/*.json,
// regenerated with `pnpm --filter @100kmph/tracking demo:emit`). All data is
// fictional: made-up shipment refs and handler first name, real city names as
// hub labels, no phone numbers, no street addresses.
//
// In production this file is replaced by a fetch of the real view for a signed
// tracking token; the pages only ever see a TrackingView.
import type { DemoScenarioName, TrackingView } from '@100kmph/tracking/view-types';
import delayed from '@100kmph/tracking/demo/delayed.json';
import delivered from '@100kmph/tracking/demo/delivered.json';
import failedAttempt from '@100kmph/tracking/demo/failed-attempt.json';
import onTime from '@100kmph/tracking/demo/on-time.json';
import outForDelivery from '@100kmph/tracking/demo/out-for-delivery.json';
import returning from '@100kmph/tracking/demo/returning.json';

// JSON imports widen string unions, so the contract is checked by the
// packages/tracking tests that produce these files; here we only assert it.
const view = (json: unknown): TrackingView => json as TrackingView;

export const scenarios: Record<DemoScenarioName, TrackingView> = {
  'on-time': view(onTime),
  'out-for-delivery': view(outForDelivery),
  delayed: view(delayed),
  'failed-attempt': view(failedAttempt),
  delivered: view(delivered),
  returning: view(returning),
};
