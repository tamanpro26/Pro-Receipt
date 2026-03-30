import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import App, { AuthProvider, type AuthState } from './App.tsx';
import './index.css';

const CLERK_KEY = (import.meta as any).env?.VITE_CLERK_PUBLISHABLE_KEY as string;

const NO_AUTH: AuthState = { clerkEnabled: false, isSignedIn: false, userId: null, getToken: async () => null };

/** Bridges Clerk hooks into our AuthContext so App.tsx never calls Clerk hooks directly */
function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId, getToken } = useAuth();
  return (
    <AuthProvider value={{ clerkEnabled: true, isSignedIn: !!isSignedIn, userId: userId ?? null, getToken }}>
      {children}
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {CLERK_KEY ? (
      <ClerkProvider publishableKey={CLERK_KEY}>
        <ClerkAuthBridge>
          <App />
        </ClerkAuthBridge>
      </ClerkProvider>
    ) : (
      <AuthProvider value={NO_AUTH}>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
);
