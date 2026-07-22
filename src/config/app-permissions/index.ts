import { additionalAppPermissionCatalogs } from "./additional-apps";
import { inventoryCountPermissionCatalog } from "./inventory-count";
import { usersPermissionCatalog } from "./users";

export const appPermissionCatalogs = [
  usersPermissionCatalog,
  inventoryCountPermissionCatalog,
  ...additionalAppPermissionCatalogs
] as const;

export { inventoryCountPermissionCatalog, usersPermissionCatalog };
export { additionalAppPermissionCatalogs };
export type { AppPermissionCatalog, AppPermissionDefinition, AppPermissionUsage } from "./types";
