import React, { createContext, useContext } from 'react';

type WelcomeGateContextValue = {
  /** Hoş geldin tamamlandı — stack gate’i anında günceller. */
  markWelcomeComplete: () => void;
};

const WelcomeGateContext = createContext<WelcomeGateContextValue | null>(null);

export function WelcomeGateProvider({
  markWelcomeComplete,
  children,
}: WelcomeGateContextValue & { children: React.ReactNode }) {
  return (
    <WelcomeGateContext.Provider value={{ markWelcomeComplete }}>
      {children}
    </WelcomeGateContext.Provider>
  );
}

export function useWelcomeGate(): WelcomeGateContextValue | null {
  return useContext(WelcomeGateContext);
}
