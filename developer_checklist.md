## Developer Manual Verification Checklist

Since local compilation was not possible due to workspace constraints, please run the following tasks to statically verify that the refactored code has no regressions:

- [ ] Rebase onto the latest `main` as `AddFacilityConfig.vue`, `FacilityDetails.vue`, and other views might have concurrent modifications in the repository.
- [ ] Run `pnpm lint` in the `apps/company` or parent workspace root directory.
- [ ] Run `pnpm typecheck` in the `apps/company` or parent workspace root directory to ensure `api()` call removals and composable usages were typed correctly.
- [ ] Perform a manual UI check for "Add Facility Address" to confirm it still handles saving successfully or throwing an error message natively.
- [ ] Perform a manual UI check for "Add Configurations" and "Clone Product Store" to verify product store details mapping is still functional.
- [ ] Perform a manual UI check for "Facility Details" to verify `oms/parties/roles` and geocode `api/geocode` lookups still populate successfully.
