import React, { useRef, useState, useEffect } from "react";
import { ethers } from "ethers";
import { useUserInfo, getAllConstructions } from '../providers/Sync';

// RDN ERC-20 contract address and ABI
const RDN_ADDRESS = "0x4004fdE3B2c323F6C2a5a9C617ca51349DFDf518";
const RDN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

export interface HeaderBarProps {
  depositing: boolean;
  setDepositing: React.Dispatch<React.SetStateAction<boolean>>;
  centerOnTile?: (col: number, row: number) => void;
}

export const HeaderBar = React.memo(function HeaderBar({ depositing, setDepositing, centerOnTile }: HeaderBarProps) {
  const { username, balance } = useUserInfo();
  const allConstructions = getAllConstructions();
  const [wallet, setWallet] = useState<string | null>(null);
  const population = allConstructions.filter(c => c.type === 'settlement').length;
  const totalTrees = allConstructions.filter(c => c.type === 'tree').length;
  const totalFlowers = allConstructions.filter(c => c.type === 'flower').length;
  // Get userid from localStorage if available
  const userid = typeof window !== 'undefined' ? localStorage.getItem('userid') : null;
  // Get all user's settlement locations
  const userSettlementLocations = allConstructions
    .filter(c => c.type === 'settlement' && c.userid === userid)
    .map(c => c.location);
  // User owns trees/flowers if they are on a user's settlement
  const userTrees = allConstructions.filter(c => c.type === 'tree' && userSettlementLocations.includes(c.location)).length;
  const userFlowers = allConstructions.filter(c => c.type === 'flower' && userSettlementLocations.includes(c.location)).length;
  const userPopulation = userSettlementLocations.length;
  const percent = population > 0 ? (userPopulation / population) * 100 : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const profileRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setWallet(localStorage.getItem("wallet"));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClick);
    } else {
      document.removeEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function depositToGameWallet() {
    if (!(window as any).ethereum) {
      alert("MetaMask is not installed");
      return;
    }
    // Always request accounts to ensure wallet is connected and unlocked
    let userWallet = null;
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      userWallet = accounts[0];
      setWallet(userWallet);
      if (userWallet) {
        localStorage.setItem("wallet", userWallet);
      }
    } catch (err) {
      alert("Please connect your wallet to deposit.");
      return;
    }
    const gameWallet = "0x5a2E2b45d553C77c2704b4F6797ddfc62BE964ec";
    const amountRdn = prompt("Enter amount of RDN to deposit to the game wallet:");
    if (!amountRdn || isNaN(Number(amountRdn)) || Number(amountRdn) <= 0) {
      alert("Invalid amount");
      return;
    }
    setDepositing(true);
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Deposit in progress. Do not close or reload this page until confirmed.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const rdn = new ethers.Contract(RDN_ADDRESS, RDN_ABI, signer);
      const decimals = await rdn.decimals();
      const value = ethers.parseUnits(amountRdn, decimals);
      const tx = await rdn.transfer(gameWallet, value);
      await tx.wait();
      const resp = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: userWallet, amount: Number(amountRdn) }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        alert('Failed to record deposit: ' + (err.error || resp.status));
        throw new Error('Deposit not recorded');
      }
      alert("Deposit transaction sent and recorded!");
    } catch (err: any) {
      alert("Transaction failed: " + (err?.message || err));
    } finally {
      setDepositing(false);
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    }
  }

  async function connectWallet() {
    if (!(window as any).ethereum) {
      alert("MetaMask is not installed");
      return;
    }
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      const wallet = accounts[0];
      setWallet(wallet);
      localStorage.setItem("wallet", wallet);
      // Check if wallet is already registered
      let serverUsername = null;
      try {
        const res = await fetch(`/api/users?wallet=${wallet}`);
        if (res.ok) {
          const data = await res.json();
          serverUsername = data.username;
          localStorage.setItem("userid", data.id);
        }
      } catch {}
      if (!serverUsername) {
        let inputUsername = "";
        let cancelled = false;
        while(!inputUsername){
          inputUsername = prompt("Enter a username:") || "";
          if (inputUsername === "") {
            if (!confirm("Username is required. Cancel wallet connection?")) {
              continue;
            } else {
              cancelled = true;
              break;
            }
          }
          if (inputUsername) {
            const check = await fetch(`/api/users?username=${encodeURIComponent(inputUsername)}`);
            const exists = check.ok && (await check.json()).exists;
            if (exists) {
              alert("Username already taken. Please choose another.");
              inputUsername = "";
            }
          }
        }
        if (cancelled) return;
        // Register new user in the database
        try {
          const resp = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet, username: inputUsername }),
          });
          if (resp.ok) {
            const data = await resp.json();
            localStorage.setItem("userid", data.id);
          } else {
            alert('Failed to register user. Please try again.');
            return;
          }
        } catch (err) {
          alert('Error registering user.');
          return;
        }
      }
      window.location.reload();
    } catch (err) {
      alert("Failed to connect wallet");
    }
  }

  const handleProfileClick = async (e: React.MouseEvent) => {
    if (!wallet) {
      await connectWallet();
      return;
    }
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom + 4 });
    setMenuOpen(v => !v);
  };

  return (
    <>
      <header className="w-full flex justify-between items-center py-2 px-3 bg-gradient-to-r from-green-700 via-green-500 to-green-300/80 mb-4 backdrop-blur-sm text-xs border-b border-green-800 shadow-lg shadow-green-200/30"
        style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, fontFamily: 'var(--font-sans)' }}>
        <div className="font-bold text-base text-emerald-950 drop-shadow-sm flex items-center gap-3">
          <span>🌳 Reden</span>
          <span className="text-xs font-semibold bg-green-200 text-green-900 px-2 py-0.5 rounded border border-green-400" title="Population">
            👥 {population}
          </span>
          <span className="text-xs font-semibold bg-green-100 text-green-900 px-2 py-0.5 rounded border border-green-400" title="Total Trees">
            🌳 {totalTrees} <span style={{color:'#388e3c',fontWeight:600}}>({userTrees})</span>
          </span>
          <span className="text-xs font-semibold bg-pink-100 text-pink-900 px-2 py-0.5 rounded border border-pink-400" title="Total Flowers">
            🌼 {totalFlowers} <span style={{color:'#e75480',fontWeight:600}}>({userFlowers})</span>
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <span
            className="flex items-center gap-1 bg-yellow-500 text-emerald-950 px-2 py-1 rounded cursor-pointer hover:bg-yellow-600 transition shadow font-semibold border border-yellow-600"
            onClick={depositToGameWallet}
            style={{ userSelect: 'none', background: 'linear-gradient(90deg, #fff7ae 60%, #f7c6c7 100%)', minHeight: 36, height: 36 }}
            title="Deposit to game balance"
          >
            <span className="mr-1 text-base" style={{lineHeight:1}}>💰</span>
            <span className="font-semibold">{balance.toFixed(4)} RDN</span>
            <span className="ml-2 text-xs font-semibold bg-green-100 text-green-900 px-2 py-0.5 rounded border border-green-300" title="Your Population">
              👤 {userPopulation}
              <span style={{ marginLeft: 4, color: '#388e3c', fontWeight: 600 }}>
                ({percent.toFixed(1)}%)
              </span>
            </span>
          </span>
          <span
            ref={profileRef}
            className="flex items-center gap-1 bg-eden-green-2 text-emerald-950 px-2 py-1 rounded cursor-pointer hover:bg-eden-green-3 transition shadow font-semibold relative border border-green-800 focus:outline-none focus:ring-2 focus:ring-green-700"
            onClick={handleProfileClick}
            tabIndex={0}
            style={{ minHeight: 36, height: 36 }}
          >
            <span className="mr-1 text-base" style={{lineHeight:1}}>👤</span>
            <span className="font-semibold">
              {wallet ? username : 'Connect Wallet'}
            </span>
            <span
              className="text-xs font-mono bg-green-200 px-1 py-0.5 rounded select-all transition flex items-center gap-1 text-emerald-950 border border-green-700"
              title={wallet || ''}
              style={{ display: wallet ? undefined : 'none' }}
            >
              {wallet ? `0x...${wallet.slice(-4)}` : ''}
            </span>
            {menuOpen && menuPos && (
              <div
                className="absolute z-50 min-w-[140px] bg-eden-green-1 border border-green-800 rounded shadow-lg py-1 text-sm right-0 mt-2 animate-fade-in text-emerald-950"
                style={{ left: '50%', transform: 'translateX(-50%)', top: '110%', background: 'var(--eden-green-1, #e0ffd8)' }}
              >
                <button className="block w-full text-left px-4 py-2 hover:bg-eden-green-2 transition" tabIndex={-1}>Profile</button>
                <button className="block w-full text-left px-4 py-2 hover:bg-eden-green-2 transition" tabIndex={-1}>Properties</button>
                <button className="block w-full text-left px-4 py-2 hover:bg-eden-green-2 transition" tabIndex={-1}>Transactions</button>
                <button className="block w-full text-left px-4 py-2 hover:bg-eden-green-2 transition" tabIndex={-1}>Settings</button>
                <button
                  className="block w-full text-left px-4 py-2 hover:bg-red-100 text-red-700 transition border-t border-green-200 mt-1"
                  tabIndex={-1}
                  onClick={() => {
                    setWallet(null);
                    setMenuOpen(false);
                    localStorage.removeItem('wallet');
                    localStorage.removeItem('userid');
                    window.location.reload();
                  }}
                >
                  Disconnect
                </button>
              </div>
            )}
          </span>
        </div>
      </header>
      {depositing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(30,34,40,0.85)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            background: '#222b36',
            color: '#fff',
            padding: '32px 40px',
            borderRadius: 12,
            fontSize: 20,
            fontWeight: 600,
            boxShadow: '0 4px 32px 0 rgba(0,0,0,0.18)',
            textAlign: 'center',
            maxWidth: 400,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <div style={{fontSize: 28, marginBottom: 16}}>⏳ Deposit in Progress</div>
            <div style={{ margin: '16px 0' }}>
              <div style={{
                border: '4px solid #444',
                borderTop: '4px solid #ffb300',
                borderRadius: '50%',
                width: 40,
                height: 40,
                animation: 'spin 1s linear infinite',
                margin: '0 auto',
              }} />
            </div>
            <div style={{fontSize: 16, marginBottom: 8}}>Please do not close or reload your browser until your deposit is confirmed.</div>
            <div style={{fontSize: 14, color: '#ffb300'}}>Closing this page before confirmation may result in a missing deposit.</div>
          </div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      <style>{`
        header {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          z-index: 10;
        }
        body { margin: 0; }
      `}</style>
    </>
  );
});
