import React, { createContext, useContext, useEffect, useState } from "react";

interface SyncContextType {
  username: string | null;
  balance: number;
  setUsername: (name: string | null) => void;
  setBalance: (balance: number) => void;
  allPlayers: any[];
  setAllPlayers: (players: any[]) => void;
  allConstructions: Array<{ location: string; type: string }>;
  setAllConstructions: (constructions: Array<{ location: string; type: string }>) => void;
}

export const SyncContext = createContext<SyncContextType & { allPlayers: any[]; setAllPlayers: React.Dispatch<React.SetStateAction<any[]>> } | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [username, setUsername] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [wallet, setWallet] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  // Add userid to the construction type
  const [allConstructions, setAllConstructions] = useState<Array<{ location: string; type: string; userid?: string }>>([]);

  // Sync wallet from localStorage
  useEffect(() => {
    setWallet(localStorage.getItem("wallet"));
    const sync = () => setWallet(localStorage.getItem("wallet"));
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Poll all sync data from consolidated API in a single interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    async function pollAll() {
      try {
        const url = wallet ? `/api/sync?wallet=${encodeURIComponent(wallet)}` : '/api/sync';
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          // Set user info if present
          if (data.user) {
            setUsername(data.user?.username || data.user?.name || null);
            let balance = 0;
            if (typeof data.user?.deposit === 'number') {
              balance = data.user.deposit;
            } else if (Array.isArray(data.user?.transactions)) {
              balance = data.user.transactions.reduce((sum: number, tx: any) => sum + (typeof tx.amount === 'number' ? tx.amount : 0), 0);
            } else if (typeof data.user?.balance === 'number') {
              balance = data.user.balance;
            }
            setBalance(balance);
            // Set userid in localStorage if not already set
            if (!localStorage.getItem("userid") && data.user?.userid) {
              localStorage.setItem("userid", data.user.userid);
            }
          } else {
            setUsername(null);
            setBalance(0);
          }
          // Set all players
          if (Array.isArray(data.allUsers)) {
            const newPlayers = data.allUsers
              .map((u: any) => {
                let loc = u.location || u.playerLocation;
                if (typeof loc === 'string') {
                  const arr = loc.split(',').map(Number);
                  if (arr.length === 2 && arr.every(n => !isNaN(n))) loc = arr;
                  else loc = null;
                }
                return loc ? { ...u, location: loc } : null;
              })
              .filter(Boolean);
            setAllPlayers((prev) => {
              if (JSON.stringify(newPlayers) !== JSON.stringify(prev)) {
                return newPlayers;
              }
              return prev;
            });
          }
          // Set all constructions
          if (Array.isArray(data.allConstructions)) {
            setAllConstructions((prev) => {
              const newConstructions = data.allConstructions.map((c: any) => ({ location: c.location, type: c.type, userid: c.userid }));
              if (JSON.stringify(newConstructions) !== JSON.stringify(prev)) {
                return newConstructions;
              }
              return prev;
            });
          }
        }
      } catch {
        setUsername(null);
        setBalance(0);
        setAllPlayers([]);
        setAllConstructions([]);
      }
    }
    pollAll();
    interval = setInterval(pollAll, 1500);
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [wallet]);

  return (
    <SyncContext.Provider value={{ username, balance, setUsername, setBalance: setBalance, allPlayers, setAllPlayers, allConstructions, setAllConstructions }}>
      {children}
    </SyncContext.Provider>
  );
};

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}

export function useUserInfo() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useUserInfo must be used within a SyncProvider");
  // Return only user info related fields
  const { username, balance, setUsername, setBalance: setDepositBalance } = context;
  return { username, balance, setUsername, setDepositBalance };
}

export function getConstructionsForLocation(location: string): string[] {
  // Use cached allConstructions from the latest sync
  const context = useContext(SyncContext);
  if (!context) throw new Error("getConstructionsForLocation must be used within a SyncProvider");
  return context.allConstructions
    .filter((c) => c.location === location)
    .map((c) => c.type);
}

export function getAllConstructions(): Array<{ location: string; type: string; userid?: string }> {
  // Use cached allConstructions from the latest sync
  const context = useContext(SyncContext);
  if (!context) throw new Error("getAllConstructions must be used within a SyncProvider");
  // Return userid if present in the construction object
  return context.allConstructions.map((c: any) => ({
    location: c.location,
    type: c.type,
    userid: c.userid
  }));
}
