import type { IMetadataProvider, IStorageAdapter, IVaultProvider } from '@/ports';
import type { IgniteSettings } from '@/settings';
import type React from 'react';
import { createContext, useContext } from 'react';

/**
 * Application-level dependencies injected from IgniteView.
 */
export interface AppContextValue {
  vaultProvider: IVaultProvider;
  storageAdapter: IStorageAdapter;
  metadataProvider: IMetadataProvider;
  settings: IgniteSettings;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

/**
 * Provider for application-level dependencies.
 */
export function AppProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: AppContextValue;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/**
 * Hook to access application-level dependencies.
 */
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
