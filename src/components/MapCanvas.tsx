import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import { useUserInfo, getAllConstructions } from '../providers/Sync';
import TileModal from './TileModal';
import { getTileFromMouseEvent, getTileFromTouchEvent, useMap } from '../providers/Grids';
import MapControl, { centerToUserFactory } from './MapControl';
import { getUserPopulation, getPopulationRadius, isAllySettlement, isEnemySettlement } from '@/app/common/Radius';

const FONT_SIZE = 8; // px, smallest readable

export interface MapCanvasProps {
  hoverCoord: [number, number] | null;
  setHoverCoord: (coord: [number, number] | null) => void;
  allPlayers?: Array<{ name: string; location: [number, number]; id?: string; population?: number }>;

  // Add callback for move action
  onMovePlayer?: (id: string, newLocation: [number, number]) => Promise<void> | void;
}

const MapCanvasInner = forwardRef<unknown, MapCanvasProps>((props, ref) => {
  const {
    offset, setOffset, zoom, animatedPositions, setAnimatedPositions,
    selectedTile, setSelectedTile, setShowMovePopup,
    handleZoom, handleMove
  } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { balance } = useUserInfo();
  const constructions = getAllConstructions().map(c => ({
    location: c.location.split(',').map(Number) as [number, number],
    type: c.type,
    userid: c.userid
  }));

  // Remove previous useEffect and state for constructions

  // Memoize visible grid bounds calculation
  const getVisibleGridBounds = useCallback(() => {
    if (!canvasRef.current) return null;
    const tileSize = 100;
    const viewW = canvasRef.current.clientWidth / zoom;
    const viewH = canvasRef.current.clientHeight / zoom;
    const cols = Math.ceil(viewW / tileSize) + 2;
    const rows = Math.ceil(viewH / tileSize) + 2;
    const startCol = Math.floor(-offset.x / tileSize);
    const startRow = Math.floor(-offset.y / tileSize);
    return { startCol, startRow, cols, rows, tileSize };
  }, [offset.x, offset.y, zoom]);

  // Draw grid and coordinates (now also depends on zoom)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const height = canvas.clientHeight * dpr;
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.scale(dpr, dpr);
    ctx.save();
    ctx.scale(zoom, zoom);

    // Use memoized grid bounds
    const gridBounds = getVisibleGridBounds();
    if (!gridBounds) return;
    const { startCol, startRow, cols, rows, tileSize } = gridBounds;

    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.fillStyle = '#bbb'; // lighter color
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // --- Draw user population circle overlay BEFORE constructions so constructions are more visible ---
    if (currentUser && currentUser.location) {
      const [userCol, userRow] = currentUser.location;
      const userid = typeof window !== 'undefined' ? localStorage.getItem('userid') : null;
      const userId = userid; // No fallback to wallet
      const userPopulation = getUserPopulation(constructions, userId);
      if (
        userCol >= startCol && userCol < startCol + cols &&
        userRow >= startRow && userRow < startRow + rows
      ) {
        const x = userCol * tileSize + offset.x + tileSize / 2;
        const y = userRow * tileSize + offset.y + tileSize / 2;
        const radius = getPopulationRadius(tileSize, userPopulation);
        ctx.save();
        ctx.globalAlpha = overlayAlpha; // Use animated alpha for fade-in
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#7fff7f'; // light green
        ctx.shadowColor = '#baffba';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }
    }

  // --- Highlight enemy settlements within overlay (draw before user overlay) ---
    if (currentUser && currentUser.location) {
      const [userCol, userRow] = currentUser.location;
      const userid = typeof window !== 'undefined' ? localStorage.getItem('userid') : null;
      const userId = userid; // No fallback to wallet
      const userPopulation = getUserPopulation(constructions, userId);
      const radius = getPopulationRadius(tileSize, userPopulation);
      const x = userCol * tileSize + offset.x + tileSize / 2;
      const y = userRow * tileSize + offset.y + tileSize / 2;
      // Track which tiles have already been rendered
      const renderedTiles = new Set<string>();
      constructions.forEach(c => {
        if (c.type !== 'settlement') return;
        const [col, row] = c.location;
        const tileKey = `${col},${row}`;
        if (renderedTiles.has(tileKey)) return;
        const tx = col * tileSize + offset.x;
        const ty = row * tileSize + offset.y;
        if (isAllySettlement(c, userId)) {
          renderedTiles.add(tileKey);
          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = 'rgba(46, 204, 113, 0.7)'; // Green overlay for user's own settlement
          ctx.fillRect(tx, ty, tileSize, tileSize); // Square highlight
          ctx.restore();
        } else {
          // Only highlight enemy settlements within the population circle
          const centerX = tx + tileSize / 2;
          const centerY = ty + tileSize / 2;
          const dist = Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2);
          if (dist <= radius) {
            renderedTiles.add(tileKey);
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = 'rgba(255,0,0,0.7)'; // Red overlay for enemy
            ctx.fillRect(tx, ty, tileSize, tileSize); // Square highlight
            ctx.restore();
          }
        }
      });
    }

// --- Draw all circle overlays (hover, selection) BEFORE constructions ---
    for (let row = startRow; row < startRow + rows; row++) {
      for (let col = startCol; col < startCol + cols; col++) {
        const x = col * tileSize + offset.x;
        const y = row * tileSize + offset.y;
        // Highlight hovered tile (original: direct equality check)
        if (
          props.hoverCoord &&
          col === props.hoverCoord[0] &&
          row === props.hoverCoord[1]
        ) {
          ctx.save();
          ctx.fillStyle = 'rgba(0, 123, 255, 0.15)'; // light blue highlight
          ctx.beginPath();
          // Draw square highlight instead of circle
          ctx.fillRect(x, y, tileSize, tileSize);
          ctx.restore();
        }
        // Draw border only if selected (and red if a player is present on selected tile or enemy settlement)
        let showBorder = false;
        let borderColor = '#007bff'; // default blue for selection
        if (selectedTile && col === selectedTile[0] && row === selectedTile[1]) {
          // Check if any player is on this selected tile
          const allPlayers = props.allPlayers || [];
          // Check if current user is on this tile
          let currentUserOnTile = false;
          if (currentUser && Array.isArray(currentUser.location)) {
            currentUserOnTile = currentUser.location[0] === col && currentUser.location[1] === row;
          }
          // Check if selected tile is an enemy settlement
          const userid = typeof window !== 'undefined' ? localStorage.getItem('userid') : null;
          const userId = userid; // No fallback to wallet
          const isEnemy = constructions.some(c => isEnemySettlement(c, userId) && c.location[0] === col && c.location[1] === row);

          if (currentUserOnTile) {
            borderColor = '#4e944f'; // green for current user
          } else if (isEnemy) {
            borderColor = 'red'; // red for enemy settlement
          } else {
            const playerOnTile = allPlayers.some(player => {
              // Use strict equality for id comparison, fallback to string comparison if needed
              const playerId = player.id != null ? String(player.id) : undefined;
              const currentUserId = currentUser?.id != null ? String(currentUser.id) : undefined;
              const pos = (playerId && animatedPositions && animatedPositions[playerId]) ? animatedPositions[playerId] : player.location;
              return Array.isArray(pos) && pos[0] === col && pos[1] === row && playerId !== currentUserId;
            });
            borderColor = playerOnTile ? 'red' : '#007bff';
          }
          showBorder = true;
        }
        if (showBorder) {
          ctx.save();
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 2; // slightly thicker for visibility
          ctx.beginPath();
          // Draw square border instead of circle
          ctx.rect(x + 1, y + 1, tileSize - 2, tileSize - 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // --- Draw all player icons and constructions (map content) ---
    // Draw constructions after overlays so they remain visible
    constructions.forEach(({ location, type }, idx) => {
      const [col, row] = location;
      if (col >= startCol && col < startCol + cols && row >= startRow && row < startRow + rows) {
        const x = col * tileSize + offset.x;
        const y = row * tileSize + offset.y;
        // --- Randomize position within the tile, but deterministic per construction ---
        // Use construction index and location as seed
        function seededRandom(seed: number) {
          let x = Math.sin(seed) * 10000;
          return x - Math.floor(x);
        }
        const seed = col * 10007 + row * 10009 + idx * 13;
        const margin = tileSize * 0.05; // reduced from 0.12 for tighter spacing
        const iconSize = tileSize * 0.22;
        const randX = x + margin + seededRandom(seed) * (tileSize - 2 * margin - iconSize) + iconSize / 2;
        const randY = y + margin + seededRandom(seed + 1) * (tileSize - 2 * margin - iconSize) + iconSize / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let icon = '';
        let iconFontSize = iconSize;
        if (type === 'tree') {
          icon = '🌳';
        } else if (type === 'settlement') {
          icon = '🏠';
        } else if (type === 'flower') {
          icon = '🌼';
          iconFontSize = iconSize * 0.7; // Make flower smaller
        }
        ctx.font = `${iconFontSize}px serif`;
        ctx.globalAlpha = 0.95;
        ctx.fillText(icon, randX, randY);
        ctx.restore();
      }
    });
    if (Array.isArray(props.allPlayers)) {
      props.allPlayers.forEach((player: any) => {
        // Use strict equality for id comparison, fallback to string comparison if needed
        const playerId = player.id != null ? String(player.id) : undefined;
        const currentUserId = currentUser?.id != null ? String(currentUser.id) : undefined;
        const pos = (playerId && animatedPositions && animatedPositions[playerId]) ? animatedPositions[playerId] : player.location;
        if (!Array.isArray(pos)) return;
        const [col, row] = pos;
        const x = col * tileSize + offset.x;
        const y = row * tileSize + offset.y;
        ctx.save();
        // Set opacity for player icon so constructions behind are visible
        ctx.globalAlpha = 0.55;
        // Use a different color and slightly smaller icon for the current user
        let isCurrentUser = false;
        if (currentUserId && playerId && playerId === currentUserId) {
          isCurrentUser = true;
        }
        ctx.fillStyle = isCurrentUser ? '#007bff' : '#4e944f'; // blue for current user, green for others
        ctx.beginPath();
        ctx.arc(x + tileSize / 2, y + tileSize / 2, isCurrentUser ? tileSize / 8.5 : tileSize / 10, 0, 2 * Math.PI); // smaller icon
        ctx.fill();
        ctx.strokeStyle = isCurrentUser ? '#003366' : '#234d20';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.font = `${Math.floor(tileSize * 0.10)}px monospace`;
        ctx.fillStyle = '#222';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(player.name || '', x + tileSize / 2, y + tileSize / 2 - (isCurrentUser ? tileSize / 8.5 : tileSize / 10) - 2);
        ctx.textBaseline = 'top';
        ctx.restore();
      });
    }

    ctx.restore();
  }, [offset, zoom, props.hoverCoord, props.allPlayers, animatedPositions, getVisibleGridBounds, constructions]);

  // Mouse drag handlers for panning (now also consider zoom)
  const [drag, setDrag] = useState<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    });
  };
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const [col, row] = getTileFromMouseEvent(e, canvasRef.current, zoom, offset);
    props.setHoverCoord([col, row]);
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = (e.clientY - drag.startY) / zoom;
    setOffset({ x: drag.origX + dx, y: drag.origY + dy });
  }, [drag, offset, zoom, props.setHoverCoord]);
  const onMouseLeave = () => {
    props.setHoverCoord(null);
    onMouseUp();
  };
  const onMouseUp = () => setDrag(null);

  // Tile click handler for selection and move popup
  const onCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const [col, row] = getTileFromMouseEvent(e, canvasRef.current, zoom, offset);
    setSelectedTile([col, row]);
    setShowMovePopup(true);
  };

  // Touch support for hover/tile coordinate
  const onTouchMove = (e: React.TouchEvent) => {
    if (!canvasRef.current) return;
    const tile = getTileFromTouchEvent(e, canvasRef.current, zoom, offset);
    if (Array.isArray(tile) && tile.length === 2) props.setHoverCoord([tile[0], tile[1]]);
  };
  const onTouchEnd = () => props.setHoverCoord(null);

  // Resize canvas to fit parent and trigger redraw
  useEffect(() => {
    const handleResize = () => {
      // Just update offset to force a redraw
      setOffset((o) => ({ ...o }));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Only render the canvas and UI on the client to avoid SSR/CSR mismatch
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fix animation effect
  useEffect(() => {
    if (!Array.isArray(props.allPlayers)) return;
    let raf: number | null = null;
    const gridBounds = getVisibleGridBounds();
    if (!gridBounds) return;
    const { startCol, startRow, cols, rows } = gridBounds;
    let visibleCols = new Set<number>();
    let visibleRows = new Set<number>();
    for (let row = startRow; row < startRow + rows; row++) visibleRows.add(row);
    for (let col = startCol; col < startCol + cols; col++) visibleCols.add(col);
    // Calculate max move distance for any visible player
    let maxDistance = 1;
    const allPlayers = props.allPlayers || [];
    Object.entries(animatedPositions).forEach(([userid, prevLoc]) => {
      const newLoc = allPlayers.find(p => p.id === userid)?.location;
      if (newLoc && (newLoc[0] !== prevLoc[0] || newLoc[1] !== prevLoc[1])) {
        // Only animate if either prevLoc or newLoc is visible
        const prevVisible = visibleCols.has(prevLoc[0]) && visibleRows.has(prevLoc[1]);
        const newVisible = visibleCols.has(newLoc[0]) && visibleRows.has(newLoc[1]);
        if (!(prevVisible || newVisible)) return;
        const dx = newLoc[0] - prevLoc[0];
        const dy = newLoc[1] - prevLoc[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDistance) maxDistance = dist;
      }
    });
    // Animation duration: 400ms + 250ms per tile moved (minimum 500ms)
    const duration = Math.max(500, 400 + 250 * maxDistance);
    const prevPositions = { ...animatedPositions };
    const playersByUserid: { [userid: string]: [number, number] } = {};
    allPlayers.forEach(player => {
      if (player.id && Array.isArray(player.location)) {
        playersByUserid[player.id] = player.location;
      }
    });
    const startTime = performance.now();
    function animate() {
      let updated = { ...animatedPositions };
      let needsUpdate = false;
      Object.entries(playersByUserid).forEach(([userid, newLoc]) => {
        const prevLoc = prevPositions[userid] || newLoc;
        // Only animate if either prevLoc or newLoc is visible
        const prevVisible = visibleCols.has(prevLoc[0]) && visibleRows.has(prevLoc[1]);
        const newVisible = visibleCols.has(newLoc[0]) && visibleRows.has(newLoc[1]);
        if (!(prevVisible || newVisible)) {
          updated[userid] = newLoc;
          return;
        }
        if (prevLoc[0] !== newLoc[0] || prevLoc[1] !== newLoc[1]) {
          const elapsed = Math.min(performance.now() - startTime, duration);
          const progress = elapsed / duration;
          const x = prevLoc[0] + (newLoc[0] - prevLoc[0]) * progress;
          const y = prevLoc[1] + (newLoc[1] - prevLoc[1]) * progress;
          updated[userid] = progress < 1 ? [x, y] : newLoc;
          if (progress < 1) needsUpdate = true;
        } else {
          updated[userid] = newLoc;
        }
      });
      // Remove players that no longer exist
      Object.keys(updated).forEach(userid => {
        if (!playersByUserid[userid]) delete updated[userid];
      });
      setAnimatedPositions(updated);
      if (needsUpdate) {
        raf = requestAnimationFrame(animate);
      }
    }
    animate();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line
  }, [props.allPlayers, offset.x, offset.y, zoom, getVisibleGridBounds]);

  // Calculate current user and user location for stable dependencies
  const [currentUser, setCurrentUser] = useState<{id: string | null, location: [number, number] | null}>({id: null, location: null});
  useEffect(() => {
    const userid = typeof window !== 'undefined' ? localStorage.getItem('userid') : null;
    if (!userid || !props.allPlayers) {
      setCurrentUser({ id: null, location: null });
      return;
    }
    const user = props.allPlayers.find(p => p.id && p.id.toString() === userid);
    let location: [number, number] | null = null;
    if (user && Array.isArray(user.location) && user.location.length === 2) {
      const [col, row] = user.location;
      if (typeof col === 'number' && typeof row === 'number' && !isNaN(col) && !isNaN(row)) {
        location = [col, row];
      }
    }
    setCurrentUser({ id: userid, location });
  }, [props.allPlayers]);

  // --- Center to User Location Mechanic (with animation) ---
  // Type assertion to satisfy the factory's expected type
  const centerToUser = centerToUserFactory({
    canvasRef: canvasRef as React.RefObject<HTMLCanvasElement>,
    allPlayers: props.allPlayers,
    zoom,
    setOffset,
    offset
  });

  // --- onInit: Called only once when map, canvas, and dependencies are fully loaded ---
  const hasInitialized = useRef(false);
  const onInit = useCallback(() => {
    centerToUser(true); // animate on init
  }, [centerToUser]);

  useEffect(() => {
    if (
      hasInitialized.current ||
      !Array.isArray(props.allPlayers) || props.allPlayers.length === 0 ||
      typeof zoom !== 'number' || zoom <= 0
    ) return;
    hasInitialized.current = true;
    onInit();
  }, [onInit, props.allPlayers, zoom]);

  // --- Overlay fade-in/out state ---
  const [overlayAlpha, setOverlayAlpha] = useState(0);
  const overlayFadeRef = useRef<number | null>(null);
  const prevOverlayKey = useRef<string | null>(null);

  // Fade in/out overlay when user location changes
  useEffect(() => {
    if (!currentUser || !currentUser.location) return;
    const overlayKey = currentUser.location[0] + ',' + currentUser.location[1];
    // If overlayKey changed, fade out then fade in
    if (prevOverlayKey.current && prevOverlayKey.current !== overlayKey) {
      // Fade out first
      if (overlayFadeRef.current) cancelAnimationFrame(overlayFadeRef.current);
      const fadeOutDuration = 250; // ms
      const fadeInDuration = 500; // ms
      const startAlpha = overlayAlpha;
      const fadeOutStart = performance.now();
      function fadeOut(now: number) {
        const elapsed = now - fadeOutStart;
        const t = Math.min(1, elapsed / fadeOutDuration);
        setOverlayAlpha(startAlpha * (1 - t));
        if (t < 1) {
          overlayFadeRef.current = requestAnimationFrame(fadeOut);
        } else {
          setOverlayAlpha(0);
          // After fade out, fade in
          const fadeInStart = performance.now();
          function fadeIn(now2: number) {
            const elapsed2 = now2 - fadeInStart;
            const t2 = Math.min(1, elapsed2 / fadeInDuration);
            setOverlayAlpha(0.12 * t2);
            if (t2 < 1) {
              overlayFadeRef.current = requestAnimationFrame(fadeIn);
            }
          }
          overlayFadeRef.current = requestAnimationFrame(fadeIn);
        }
      }
      overlayFadeRef.current = requestAnimationFrame(fadeOut);
    } else {
      // Normal fade in if first time or same location
      setOverlayAlpha(0);
      if (overlayFadeRef.current) cancelAnimationFrame(overlayFadeRef.current);
      const duration = 500; // ms
      const startTime = performance.now();
      function animate(now: number) {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        setOverlayAlpha(0.12 * t); // Target alpha is 0.12
        if (t < 1) {
          overlayFadeRef.current = requestAnimationFrame(animate);
        }
      }
      overlayFadeRef.current = requestAnimationFrame(animate);
    }
    prevOverlayKey.current = overlayKey;
    return () => {
      if (overlayFadeRef.current) cancelAnimationFrame(overlayFadeRef.current);
    };
    // eslint-disable-next-line
  }, [currentUser && currentUser.location && (currentUser.location[0] + ',' + currentUser.location[1])]);

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 0, background: '#e0ffd8' }}>
      {/* Always render canvas and controls, overlay a loading indicator if centering */}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', background: '#e0ffd8' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseUp={onMouseUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={onCanvasClick}
      />
      {/* Move Popup */}
      {selectedTile && (
        <TileModal
          selectedTile={selectedTile}
          currentUser={
            currentUser && currentUser.id && currentUser.location
              ? {
                  name: currentUser.id,
                  location: currentUser.location,
                  userid: currentUser.id
                }
              : undefined
          }
          balance={balance}
          onMove={() => handleMove({ currentUser, selectedTile, balance, onMovePlayer: props.onMovePlayer })}
          onCancel={() => { /* do nothing, keep modal open */ }}
          allPlayers={props.allPlayers}
          onPlantTree={() => {}}
          onBuildSettlement={() => {}}
          constructionCount={null}
          constructionTypes={[]}
          tileSize={getVisibleGridBounds()?.tileSize || 100}
          offset={offset}
        />
      )}
      {/* Map Controls */}
      <MapControl 
        onZoomIn={() => handleZoom(1.2)} 
        onZoomOut={() => handleZoom(1 / 1.2)}
        onCenterUser={() => centerToUser(true)}
      />
      {/* Overlay loading indicator if centering */}
      {/* Loading overlay removed as requested */}
    </div>
  );
});

const MapCanvas = React.memo(MapCanvasInner);

export default MapCanvas;
