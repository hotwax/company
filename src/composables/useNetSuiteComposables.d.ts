// This module provides composable functions for managing NetSuite integrations, allowing for asynchronous operations such as 
//adding, editing, updating, and removing NetSuite IDs based on specified integration mapping data.
declare module "@/composables/useNetSuiteComposables" {
  export function useNetSuiteComposables(integrationTypeId: string): {
    editNetSuiteId: (mappingKey: any, integrationMapping: any) => Promise<void>;
    addNetSuiteId: (payload: any) => Promise<void>;
    updateNetSuiteId: (payload: any, integrationMappingId: any) => Promise<void>;
    removeNetSuiteId: (integrationMappingId: any) => Promise<void>;
  };
}