import type { ILLMProvider } from '@/ports';
import type React from 'react';
import { createContext, useContext } from 'react';

/**
 * LLM provider context value.
 */
export interface LLMContextValue {
  llmProvider: ILLMProvider;
}

const LLMContext = createContext<LLMContextValue | undefined>(undefined);

/**
 * Provider for LLM capabilities.
 */
export function LLMProvider({
  children,
  llmProvider,
}: {
  children: React.ReactNode;
  llmProvider: ILLMProvider;
}) {
  return <LLMContext.Provider value={{ llmProvider }}>{children}</LLMContext.Provider>;
}

/**
 * Hook to access LLM provider.
 */
export function useLLM(): LLMContextValue {
  const context = useContext(LLMContext);
  if (!context) {
    throw new Error('useLLM must be used within LLMProvider');
  }
  return context;
}
