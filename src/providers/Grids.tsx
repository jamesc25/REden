import React, { createContext, useContext, useState, useCallback } from 'react';

// --- Grid and Tile Utilities ---
export function getTileFromMouseEvent(e: React.MouseEvent, canvas: HTMLCanvasElement, zoom: number, offset: {x: number, y: number}): [number, number] {
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) / zoom - offset.x;
  const mouseY = (e.clientY - rect.top) / zoom - offset.y;
  const tileSize = Math.max(100, 30 / zoom);
  const col = Math.floor(mouseX / tileSize);
  const row = Math.floor(mouseY / tileSize);
  return [col, row];
}

export function getTileFromTouchEvent(e: React.TouchEvent, canvas: HTMLCanvasElement, zoom: number, offset: {x: number, y: number}): [number, number] | null {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  if (!touch) return null;
  const mouseX = (touch.clientX - rect.left) / zoom - offset.x;
  const mouseY = (touch.clientY - rect.top) / zoom - offset.y;
  const tileSize = Math.max(100, 30 / zoom);
  const col = Math.floor(mouseX / tileSize);
  const row = Math.floor(mouseY / tileSize);
  return [col, row];
}

export function getTileSize(zoom: number): number {
  return Math.max(100, 30 / zoom);
}

// --- MapProvider Context ---
export interface MapProviderValue {
  offset: { x: number; y: number };
  setOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  animatedPositions: { [userid: string]: [number, number] };
  setAnimatedPositions: React.Dispatch<React.SetStateAction<{ [userid: string]: [number, number] }>>;
  isCentering: boolean;
  setIsCentering: React.Dispatch<React.SetStateAction<boolean>>;
  isFullyLoaded: boolean;
  setIsFullyLoaded: React.Dispatch<React.SetStateAction<boolean>>;
  selectedTile: [number, number] | null;
  setSelectedTile: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  showMovePopup: boolean;
  setShowMovePopup: React.Dispatch<React.SetStateAction<boolean>>;
  handleZoom: (factor: number) => void;
  handleMove: (args: { currentUser: any, selectedTile: [number, number] | null, balance: number | undefined, onMovePlayer?: (userid: string, newLocation: [number, number]) => Promise<void> | void }) => Promise<void>;
}

const GridContext = createContext<MapProviderValue | undefined>(undefined);

export const GridProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [animatedPositions, setAnimatedPositions] = useState<{ [userid: string]: [number, number] }>({});
  const [isCentering, setIsCentering] = useState(false);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);
  const [selectedTile, setSelectedTile] = useState<[number, number] | null>(null);
  const [showMovePopup, setShowMovePopup] = useState(false);

  // Zoom logic
  const handleZoom = useCallback((factor: number) => {
    setZoom(z => Math.max(0.5, Math.min(z * factor, 5)));
  }, []);

  // Move logic (delegates to parent-provided onMovePlayer)
  interface HandleMoveArgs {
    currentUser: { id?: string; location?: [number, number] } | undefined;
    selectedTile: [number, number] | null;
    balance: number | undefined;
    onMovePlayer?: (id: string, newLocation: [number, number]) => Promise<void> | void;
  }

  const handleMove = useCallback(async ({ currentUser, selectedTile, balance, onMovePlayer }: HandleMoveArgs) => {
    if (!selectedTile || !currentUser || !Array.isArray(currentUser.location)) return;
    if (typeof balance !== 'number' || balance < 0.0001) {
      alert('Insufficient balance to move.');
      return;
    }
    if (onMovePlayer && currentUser.id) {
      await onMovePlayer(currentUser.id, selectedTile);
    }
    setShowMovePopup(false);
  }, []);

  return (
    <GridContext.Provider value={{
      offset, setOffset, zoom, setZoom, animatedPositions, setAnimatedPositions,
      isCentering, setIsCentering, isFullyLoaded, setIsFullyLoaded,
      selectedTile, setSelectedTile, showMovePopup, setShowMovePopup,
      handleZoom, handleMove
    }}>
      {children}
    </GridContext.Provider>
  );
};

export function useMap() {
  const ctx = useContext(GridContext);
  if (!ctx) throw new Error('useMap must be used within a MapProvider');
  return ctx;
}
