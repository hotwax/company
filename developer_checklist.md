# Developer Checklist for `useShopifyTransferSync` consolidation

Please run the following commands locally within the `apps/company` or parent workspace directory to ensure static verification matches the changes:

- [ ] Delete `src/composables/useShopifyTransferDelivery.ts`, `src/composables/useShopifyTransferDetach.ts`, and `src/composables/useShopifyTransferUpdateCheck.ts`.
- [ ] Run `pnpm typecheck` in the repository or `apps/company` to verify zero TypeScript regressions.
- [ ] Run `pnpm lint` in the repository or `apps/company`.
- [ ] Run `pnpm test:unit` to verify the modified `vi.mock` entries are resolving properly.
