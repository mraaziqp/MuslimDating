// Thin re-export — canonical implementation lives in context/AuthContext.tsx.
// All existing `import { useAuth, AuthProvider } from './AuthProvider'` continue to work.
export { useAuth, AuthProvider } from '../context/AuthContext';
export type { AuthContextType, ProfileCompat, SyncOptions } from '../context/AuthContext';
