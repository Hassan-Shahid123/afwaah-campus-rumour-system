import { createContext, useState, useEffect } from 'react';
import { identityManager, membershipTree, reputationManager, snapshotter } from './api';

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

  const createAccount = async () => {
    setLoading(true);
    try {
      const identity = await identityManager.create();
      const nullifier = `user_${identity.commitment.substring(0, 12)}`;

      // Add to membership tree
      await membershipTree.addMember(identity.commitment);

      // Register in reputation system
      await reputationManager.register(nullifier);

      // Record JOIN in the system
      await snapshotter.ingest({
        type: 'JOIN',
        payload: { commitment: identity.commitment, nullifier, timestamp: Date.now() },
        timestamp: Date.now(),
      });

      const userData = {
        commitment: identity.commitment,
        exportedKey: identity.exportedKey,
        publicKey: identity.publicKey,
        nullifier,
        createdAt: Date.now(),
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
    setLoading(true);
    try {
      const identity = await identityManager.importIdentity(exportedKey);
      const nullifier = `user_${identity.commitment.substring(0, 12)}`;

      const userData = {
        commitment: identity.commitment,
        exportedKey,
        publicKey: identity.publicKey,
        nullifier,
        createdAt: Date.now(),
      };
      setUser(userData);
      setLoading(false);
      return userData;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, loading, createAccount, restoreAccount, logout }}>
      {children}
    </UserContext.Provider>
  );
}
