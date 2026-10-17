import { createContext, useContext, type ReactNode } from 'react';

interface UIContextValue {
  /** Opens a blank workout, or continues the open workout with this id. */
  openAddWorkout: (draftId?: string) => void;
  openProfile: () => void;
  notify: (message: string) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ value, children }: { value: UIContextValue; children: ReactNode }) {
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
