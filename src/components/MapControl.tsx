import React from 'react';

// Shared button style
const baseButtonStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 24,
  background: '#222',
  border: 'none',
  color: '#fff',
  fontSize: 28,
  fontWeight: 'bold',
  boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 0.2s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

interface MapControlProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenterUser?: () => void;
}

const MapControl: React.FC<MapControlProps> = React.memo(({ onZoomIn, onZoomOut, onCenterUser }) => {
  const centerBtnStyle: React.CSSProperties = {
    ...baseButtonStyle,
    background: onCenterUser ? '#222' : '#888',
    cursor: onCenterUser ? 'pointer' : 'not-allowed',
    opacity: onCenterUser ? 1 : 0.5,
  };

  return (
    <div style={{ position: 'absolute', right: 24, bottom: 40, display: 'flex', flexDirection: 'column', gap: 12, zIndex: 2 }}>
      <button
        onClick={onCenterUser}
        disabled={!onCenterUser}
        style={centerBtnStyle}
        aria-label="Center on your location"
        title="Center on your location"
      >
        <span style={{ fontSize: 28, lineHeight: 1, display: 'inline-block', verticalAlign: 'middle' }}>◎</span>
      </button>
      <button
        onClick={onZoomIn}
        style={baseButtonStyle}
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={onZoomOut}
        style={baseButtonStyle}
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
});

export function centerToUserFactory({
  canvasRef,
  allPlayers,
  zoom,
  setOffset,
  offset
}: {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  allPlayers: Array<{ id?: string; location: [number, number] }> | undefined;
  zoom: number;
  setOffset: (offset: { x: number; y: number }) => void;
  offset: { x: number; y: number };
}) {
  return function centerToUser(animate = false) {
    const userId = typeof window !== 'undefined' ? localStorage.getItem('userid') : null;
    if (!userId || !allPlayers) return;
    const currentPlayer = allPlayers.find(player => player.id && player.id.toString() === userId);
    if (!currentPlayer || !Array.isArray(currentPlayer.location) || currentPlayer.location.length !== 2) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const tileSize = 100;
    const centerScreen = { x: rect.width / 2, y: rect.height / 2 };
    const targetOffset = {
      x: centerScreen.x / zoom - currentPlayer.location[0] * tileSize - tileSize / 2,
      y: centerScreen.y / zoom - currentPlayer.location[1] * tileSize - tileSize / 2,
    };
    if (!animate) {
      setOffset(targetOffset);
      return;
    }
    // Animate offset
    const duration = 500; // ms
    const startOffset = { ...offset };
    const startTime = performance.now();
    function animateStep(now: number) {
      const elapsed = Math.min(now - startTime, duration);
      const t = elapsed / duration;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
      setOffset({
        x: startOffset.x + (targetOffset.x - startOffset.x) * ease,
        y: startOffset.y + (targetOffset.y - startOffset.y) * ease,
      });
      if (elapsed < duration) {
        requestAnimationFrame(animateStep);
      } else {
        setOffset(targetOffset);
      }
    }
    requestAnimationFrame(animateStep);
  };
}

export default MapControl;
