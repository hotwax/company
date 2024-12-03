declare module "@/composables/useNetSuiteComposables" {
  export function useNetSuiteComposables(integrationTypeId: string): {
    editNetSuiteId: (mappingKey: any, integrationMapping: any) => Promise<void>;
    addNetSuiteId: (payload: any) => Promise<void>;
    updateNetSuiteId: (payload: any, integrationMappingId: any) => Promise<void>;
    removeNetSuiteId: (integrationMappingId: any) => Promise<void>;
  };
}