import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock MSAL
vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {
      getActiveAccount: () => null,
      getAllAccounts: () => [],
    },
    accounts: [],
    inProgress: 'none',
  }),
  useIsAuthenticated: () => false,
  MsalProvider: ({ children }: { children: React.ReactNode }) => children,
  AuthenticatedTemplate: ({ children }: { children: React.ReactNode }) => null,
  UnauthenticatedTemplate: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
