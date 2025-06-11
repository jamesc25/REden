"use client";

import React, { useState, useEffect, useCallback, useRef, useContext } from "react";
import { HeaderBar } from "../components/HeaderBar";
import MapCanvas from "../components/MapCanvas";
import { StatusBar } from "../components/StatusBar";
import { getMoveCost } from './common/Costs';
import { SyncContext } from '../providers/Sync';

export default function Home() {
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [depositing, setDepositing] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [hoverCoord, setHoverCoord] = useState<[number, number] | null>(null);
  const [playerLocation, setPlayerLocation] = useState<[number, number] | null>(null);
  const sync = useContext(SyncContext);
  if (!sync) throw new Error('SyncContext not found');
  const { allPlayers, setAllPlayers } = sync;

  // Restore saved viewport position and zoom level (only on mount)
  useEffect(() => {
    const savedOffset = localStorage.getItem('mapOffset');
    const savedZoom = localStorage.getItem('mapZoom');
    if (savedOffset) setOffset(JSON.parse(savedOffset));
    if (savedZoom) setZoom(parseFloat(savedZoom));
  }, []);

  // Save viewport position and zoom level to localStorage on change (debounced)
  const saveViewport = useCallback(() => {
    localStorage.setItem('mapOffset', JSON.stringify(offset));
    localStorage.setItem('mapZoom', zoom.toString());
  }, [offset, zoom]);

  useEffect(() => {
    const id = setTimeout(saveViewport, 150);
    return () => clearTimeout(id);
  }, [offset, zoom, saveViewport]);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Callback to handle player move from MapCanvas
  const onMovePlayer = useCallback(async (id: string, newLocation: [number, number]) => {
    // Find current user and calculate move cost
    const player = allPlayers.find(p => p.id === Number(id));
    const from = player && Array.isArray(player.location) ? player.location : null;
    const to = newLocation;
    let moveCost = 1;
    if (from) moveCost = getMoveCost(from, to);

    // Update in-memory state
    setAllPlayers((players: any[]) => players.map((p: any) =>
      p.id === id ? { ...p, location: newLocation } : p
    ));
    // Record move transaction (negative amount) via /api/move
    try {
      await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, amount: -moveCost, location: newLocation }),
      });
    } catch (e) {
      // Handle error (optional)
    }
    // If this is the current user, update their location state
    if (playerLocation && allPlayers.find(p => p.id === id)) {
      setPlayerLocation(newLocation);
      // Save to localStorage immediately for persistence
      localStorage.setItem('playerLocation', JSON.stringify(newLocation));
    }
  }, [playerLocation, allPlayers, setAllPlayers]);

  return (
    <>
      <HeaderBar depositing={depositing} setDepositing={setDepositing} />
      <MapCanvas hoverCoord={hoverCoord} setHoverCoord={setHoverCoord} allPlayers={allPlayers} onMovePlayer={onMovePlayer} />
      <StatusBar hoverCoord={hoverCoord} />
    </>
  );
}
