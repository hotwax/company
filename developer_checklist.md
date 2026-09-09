# Developer Verification Checklist
Since tests cannot be run standalone due to workspace and tooling constraints (this app depends on `pnpm typecheck` from the monorepo root), please run the following verification steps locally:

1. **Verify Types**:
   - Run `pnpm typecheck` in `apps/company` to verify zero TypeScript regressions with `useFacilityMutations` changes.
   - Run `pnpm lint` in `apps/company` to ensure imports are correctly mapped.

2. **Verify Create Facility (UI)**:
   - Navigate to the **Create Facility** page.
   - Create a physical facility and verify that the API request fires and the facility is successfully added to the cached `useFacilities` list.

3. **Verify Create Parking (UI)**:
   - Navigate to the **Parking** module.
   - Create a new virtual facility and verify it appears immediately in the parking list (i.e. the live query cache correctly catches the `refreshAfterMutation` triggered within `useFacilityMutations`).

4. **Verify Product Store Onboarding Wizard (UI)**:
   - Step through the **Product Store Onboarding** and verify the default facility creation step succeeds.
