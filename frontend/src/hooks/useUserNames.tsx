import { type User, listUsers } from "@/services/api";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface UserNamesContextValue {
  users: User[];
  userMap: Record<string, string>;
  loaded: boolean;
  getName: (pid: string | null | undefined) => string;
  refresh: () => Promise<void>;
  /** Inject externally-fetched user data to avoid redundant API calls. */
  injectUsers: (users: User[]) => void;
}

const UserNamesContext = createContext<UserNamesContextValue>({
  users: [],
  userMap: {},
  loaded: false,
  getName: (pid) => (pid ? `${pid.substring(0, 10)}...` : "-"),
  refresh: async () => {},
  injectUsers: () => {},
});

export const UserNamesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const fetched = await listUsers();
      const map: Record<string, string> = {};
      for (const u of fetched) {
        if (u.pid) map[u.pid] = u.name || u.email;
      }
      setUsers(fetched);
      setUserMap(map);
    } catch {
      // Fallback to truncated PID display; log for debugging
      console.warn("Failed to load user list for name resolution");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const injectUsers = useCallback((injected: User[]) => {
    const map: Record<string, string> = {};
    for (const u of injected) {
      if (u.pid) map[u.pid] = u.name || u.email;
    }
    setUsers(injected);
    setUserMap(map);
    setLoaded(true);
  }, []);

  const getName = useCallback(
    (pid: string | null | undefined): string => {
      if (!pid) return "-";
      return userMap[pid] || `${pid.substring(0, 10)}...`;
    },
    [userMap],
  );

  const value = useMemo(
    () => ({
      users,
      userMap,
      loaded,
      getName,
      refresh: fetchUsers,
      injectUsers,
    }),
    [users, userMap, loaded, getName, fetchUsers, injectUsers],
  );

  return (
    <UserNamesContext.Provider value={value}>
      {children}
    </UserNamesContext.Provider>
  );
};

/** Hook that provides name lookups by PID from the shared UserNamesContext. */
export function useUserNames() {
  const ctx = useContext(UserNamesContext);
  return ctx;
}
