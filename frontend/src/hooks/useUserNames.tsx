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
  error: string | null;
  refreshing: boolean;
  getName: (pid: string | null | undefined) => string;
  refresh: () => Promise<void>;
}

const UserNamesContext = createContext<UserNamesContextValue>({
  users: [],
  userMap: {},
  loaded: false,
  error: null,
  refreshing: false,
  getName: (pid) => (pid ? `${pid.substring(0, 10)}...` : "-"),
  refresh: async () => {},
});

export const UserNamesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchUsers = useCallback(async () => {
    setRefreshing(true);
    try {
      const fetched = await listUsers();
      const map: Record<string, string> = {};
      for (const u of fetched) {
        if (u.pid) map[u.pid] = u.name || u.email || "";
      }
      setUsers(fetched);
      setUserMap(map);
      setError(null);
    } catch {
      // 失败保留旧数据，避免每次渲染重复请求。
      setError("用户姓名解析失败，部分姓名将显示用户编号");
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

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
      error,
      refreshing,
      getName,
      refresh: fetchUsers,
    }),
    [users, userMap, loaded, error, refreshing, getName, fetchUsers],
  );

  return (
    <UserNamesContext.Provider value={value}>
      {children}
    </UserNamesContext.Provider>
  );
};

/** Hook that provides name lookups by PID from the shared UserNamesContext. */
export function useUserNames() {
  return useContext(UserNamesContext);
}
