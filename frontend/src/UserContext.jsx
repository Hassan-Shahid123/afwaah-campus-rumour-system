import { createContext, useState, useEffect } from 'react';
import { identityManager, emailVerifier } from './api';

const UserContext = createContext(null);
export { UserContext };

const STORAGE_KEY = 'afwaah_user';

export function UserProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  // Persist to localStorage whenever user changes
  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  /**
   * Primary account creation: verify .eml → create identity → bind email → register.
   * This is the ONLY way to create a new account. No unverified accounts exist.
   */
  const verifyAndCreateAccount = async (emlContent) => {
    if (!emlContent) throw new Error('Please upload or paste your .eml file.');
    setLoading(true);
    try {
      // Step 1: Create a cryptographic identity (keypair) on the backend
      const identity = await identityManager.create();

      // Step 2: Verify email + bind to identity + add to tree + register
      // This single endpoint does DKIM verification + commitment binding.
      const data = await emailVerifier.verifyAndRegister(emlContent, identity.exportedKey);

      const nullifier = `user_${data.commitment.substring(0, 12)}`;

      const userData = {
        commitment: data.commitment,
        exportedKey: identity.exportedKey,
        publicKey: identity.publicKey,
        nullifier,
        createdAt: Date.now(),
        emailVerified: true,
        verifiedEmail: data.binding?.email || data.email,
      };
      setUser(userData);
      setLoading(false);
      return userData;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const restoreAccount = async (exportedKey) => {
    if (!exportedKey || typeof exportedKey !== 'string' || exportedKey.trim().length === 0) {
      throw new Error('Please enter your recovery key.');
    }
    setLoading(true);
    try {
      // This call validates the key AND checks membership on the backend
      const identity = await identityManager.importIdentity(exportedKey.trim());

      // Backend returns { found: true } only if the commitment is in the membership tree
      if (!identity.found) {
        throw new Error('No account found for this recovery key. You must verify your email first to create an account.');
      }

      const nullifier = `user_${identity.commitment.substring(0, 12)}`;

      const userData = {
        commitment: identity.commitment,
        exportedKey: exportedKey.trim(),
        publicKey: identity.publicKey,
        nullifier,
        createdAt: Date.now(),
        restored: true,
        // Restored accounts were previously verified (they're in the membership tree)
        emailVerified: true,
      };
      setUser(userData);
      setLoading(false);
      return userData;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const updateUser = (fields) => {
    setUser(prev => prev ? { ...prev, ...fields } : prev);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, loading, verifyAndCreateAccount, restoreAccount, updateUser, logout }}>
      {children}
    </UserContext.Provider>
  );
}
