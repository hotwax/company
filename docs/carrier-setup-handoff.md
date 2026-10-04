# Company carrier setup handoff

Paused at Aditya's request on October 3, 2026, pending Rakshit updating UniGate UAT to a compatible current release.

## Saved work

- Separate OMS–UniGate connection settings from carrier management, with automatic connection checks and redacted edit history.
- Guided carrier setup: usage choice, prerequisites, credentials, direct service mapping or rate shopping, methods, facilities/accounts, product store methods, Shopify mappings, and review.
- Facility setup precedes product store method assignment; the label-generation choice is asked once.
- Reuse the Product Store wizard navigation/layout, outlined controls, and Ionic select popovers.
- Preserve advanced carrier configuration screens and reorder integration/navigation entries as requested.

## Confirmed deployment blocker

The live UniGate UAT System dashboard reports component version 1.4.0, branch `comm-gateway-v2`, commit `0804d23427` (May 7, 2026). It exposes `shipGatewayConfig` and `shipGatewayAuth`.

On May 8, both OMS and UniGate source changed to `shippingGatewayConfig` and `shippingGatewayAuth`. These changes merged May 11 in UniGate PR #58 and OMS PR #491. Demo OMS requests the newer names, while UAT serves the older names. Its carrier registry request returns upstream 404; the unchanged communication registry succeeds, confirming OMS–UniGate authentication separately.

- UniGate change: https://github.com/hotwax/hotwax-unigate/pull/58
- OMS change: https://github.com/hotwax/oms/pull/491
- Live deployment details: https://unigate-uat.hotwax.io/apps/system/dashboard

No deployment was performed. Do not change OMS back to the older route names based on this UAT mismatch.

## Resume

1. Confirm Rakshit's deployed UniGate branch/commit includes the renamed routes.
2. In the Company app connected to demo-maarg, recheck UniGate and enter the FedEx setup credential step.
3. Validate carrier provider/auth list response shapes and credential save behavior against that real deployment.
4. Complete sandbox credential, facility account, product store, and Shopify mapping validation using intended demo records.
5. Validate sandbox rate and label generation before describing the integration as ready; no actual FedEx label generation has been verified.

## Validation limits

Wizard desktop/mobile layout and popovers were checked in the running app. Before parking this branch, all 120 tests across 9 focused carrier, UniGate, and Product Store wizard suites passed; staged UI checks and diff whitespace checks passed. Lint found 12 existing errors in Menu.vue and CarrierDetails.spec.ts, all reproduced against the original main commit. The earlier production build passed. Repository-wide typechecking has existing errors outside the wizard changes. Backend credential and shipping validation remains blocked by the deployment mismatch. Unit tests are code checks, not proof of a working integration.
