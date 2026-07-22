export type AppPermissionCatalog = {
  appId: string;
  appName: string;
  appDescription: string;
  appAccessPermissionIds: readonly string[];
  adminPermissionIds: readonly string[];
  permissions: readonly AppPermissionDefinition[];
};

export type AppPermissionDefinition = {
  permissionId: string;
  title: string;
  description: string;
  category: string;
  usedIn: readonly AppPermissionUsage[];
  impliedBy?: readonly string[];
};

export type AppPermissionUsage = {
  file: string;
  context: string;
  routeName?: string;
  routePath?: string;
};

export const defineAppPermissionCatalog = <Catalog extends AppPermissionCatalog>(catalog: Catalog) => catalog;
