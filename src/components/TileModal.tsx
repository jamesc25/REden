// Refactored for clarity and maintainability: improved variable/function names, removed unnecessary code, and added concise comments for key logic.
import React, { useMemo, useState } from 'react';
import { getMoveCost, getPlantTreeCost, getSettlementCost, getPlantFlowerCost, getConquerCost } from '../app/common/Costs';
import { getAllConstructions } from '../providers/Sync';
import { getUserPopulation, getPopulationRadius, getEnemySettlementsWithinRadius, getAllySettlements, getConquerProbability } from '../app/common/Radius';

interface TileModalProps {
  selectedTile: [number, number];
  currentUser: { name: string; location: [number, number]; userid?: string } | undefined;
  balance: number | undefined;
  onMove: () => void;
  onCancel: () => void;
  allPlayers?: Array<{ name: string; location: [number, number]; userid?: string }>;
  onPlantTree?: (tileKey: string) => void;
  canPlantTree?: boolean;
  constructionCount?: number | null;
  constructionTypes?: string[];
  onBuildSettlement?: (tileKey: string) => void;
  tileSize: number;
  offset: { x: number; y: number };
}

const TileModal: React.FC<TileModalProps> = ({
  selectedTile,
  currentUser,
  balance: balance,
  onMove,
  allPlayers = [],
  onPlantTree,
  constructionCount,
  constructionTypes = [],
  onBuildSettlement,
  tileSize,
  offset
}) => {
  // Calculate move cost based on current user location and selected tile
  const moveCost = useMemo(() => (
    currentUser && Array.isArray(currentUser.location)
      ? getMoveCost(currentUser.location, selectedTile)
      : 0
  ), [currentUser, selectedTile]);

  const plantTreeCost = getPlantTreeCost();
  const plantFlowerCost = getPlantFlowerCost();
  const settlementCost = getSettlementCost();

  const [isPlanting, setIsPlanting] = useState(false);
  const [isPlantingFlower, setIsPlantingFlower] = useState(false);
  const [isBuildingSettlement, setIsBuildingSettlement] = useState(false);
  const [isMoving, setIsMoving] = useState(false);

  const hasInsufficientBalance =
    balance === undefined ||
    !currentUser ||
    !Array.isArray(currentUser.location) ||
    balance < moveCost;

  // Check if another player is on the selected tile
  const isOtherPlayerOnTile = allPlayers.some(player => {
    if (!Array.isArray(player.location)) return false;
    if (currentUser && player.userid === currentUser.userid) return false;
    return player.location[0] === selectedTile[0] && player.location[1] === selectedTile[1];
  });

  // Check if current user is on this tile
  const isCurrentUserOnTile = currentUser && Array.isArray(currentUser.location)
    && currentUser.location[0] === selectedTile[0] && currentUser.location[1] === selectedTile[1];

  // Get constructions for this tile
  const allConstructions = getAllConstructions();
  const tileKey = selectedTile.join(',');
  const constructionsOnTile = allConstructions.filter(c => c.location === tileKey);
  const constructionCountOnTile = constructionsOnTile.length;
  const constructionTypesOnTile = constructionsOnTile.map(c => c.type);

  // --- Conquer logic ---
  // Find if there is an enemy settlement on this tile
  const userid = (typeof window !== 'undefined' && currentUser?.userid) ? currentUser.userid : null;
  const enemySettlement = constructionsOnTile.find(c => c.type === 'settlement' && c.userid && c.userid !== userid);
  // Calculate adjacency (orthogonal or diagonal)
  let isEnemySettlementAdjacent = false;
  if (enemySettlement && currentUser && Array.isArray(currentUser.location)) {
    const [userCol, userRow] = currentUser.location;
    const [col, row] = selectedTile;
    const dx = Math.abs(userCol - col);
    const dy = Math.abs(userRow - row);
    isEnemySettlementAdjacent = (dx <= 1 && dy <= 1 && (dx + dy) > 0); // Adjacent including diagonals
  }

  // Conquer cost from Costs.ts
  const conquerCost = getConquerCost();

  // --- Conquer probability logic ---
  const allConstructionsTyped = allConstructions.map(c => ({
    ...c,
    location: typeof c.location === 'string' ? c.location.split(',').map(Number) as [number, number] : c.location
  }));
  let conquerProbability: number | null = null;
  if (enemySettlement && currentUser?.userid) {
    conquerProbability = getConquerProbability(
      allConstructionsTyped,
      currentUser.userid,
      selectedTile,
      tileSize,
      offset
    );
  }

  const handleConquer = async () => {
    if (!enemySettlement || !currentUser?.userid) return;
    setIsMoving(true);
    try {
      const response = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentUser.userid,
          amount: -moveCost,
          location: selectedTile,
          conquer: true,
          conquerCost: -conquerCost,
          tileSize,
          offset
        })
      });
      const result = await response.json();
      if (!result.ok && result.conquerSuccess === false) {
        alert(
          result.conquerProbability !== undefined
            ? `Conquer failed! Probability was ${(result.conquerProbability * 100).toFixed(0)}%.`
            : 'Conquer failed!'
        );
      }
      // Optionally, trigger a sync or callback here
    } finally {
      setIsMoving(false);
    }
  };

  const handlePlantTree = async () => {
    if (!currentUser?.userid) return;
    setIsPlanting(true);
    try {
      const tileKey = selectedTile.join(',');
      await fetch('/api/construct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid: currentUser.userid, location: tileKey, type: 'tree' }),
      });
      if (onPlantTree) onPlantTree(tileKey);
    } finally {
      setIsPlanting(false);
    }
  };

  const handlePlantFlower = async () => {
    if (!currentUser?.userid) return;
    setIsPlantingFlower(true);
    try {
      const tileKey = selectedTile.join(',');
      await fetch('/api/construct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid: currentUser.userid, location: tileKey, type: 'flower' }),
      });
      if (onPlantTree) onPlantTree(tileKey); // Optionally, add a separate callback for flowers
    } finally {
      setIsPlantingFlower(false);
    }
  };

  const handleBuildSettlement = async () => {
    if (!currentUser?.userid) return;
    if (constructionTypes.includes('settlement')) return;
    setIsBuildingSettlement(true);
    try {
      const tileKey = selectedTile.join(',');
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: currentUser.userid, amount: -settlementCost, type: 'construct-settlement' }),
      });
      await fetch('/api/construct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid: currentUser.userid, location: tileKey, type: 'settlement' }),
      });
      if (onBuildSettlement) onBuildSettlement(tileKey);
    } finally {
      setIsBuildingSettlement(false);
    }
  };

  const handleMove = async () => {
    if (hasInsufficientBalance || !onMove) return;
    setIsMoving(true);
    try {
      await onMove();
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 60,
      right: 32,
      background: 'rgba(255,255,255,0.6)',
      border: '3px solid #2ecc40',
      borderRadius: 16,
      boxShadow: '0 8px 32px 0 rgba(34,139,34,0.25), 0 2px 8px 0 rgba(0,0,0,0.10)',
      padding: '36px 44px',
      zIndex: 200,
      minWidth: 240,
      textAlign: 'center',
      transition: 'all 0.2s',
    }}>
      <div style={{fontSize: 18, fontWeight: 300, marginBottom: 14, color: '#228B22', letterSpacing: 0.5}}>Location Details</div>
      <div style={{fontSize: 12, marginBottom: 6, color: '#234d20'}}>({selectedTile[0]}, {selectedTile[1]})</div>
      <div style={{fontSize: 13, marginBottom: 6, color: '#234d20', fontWeight: 500}}>
        {constructionCountOnTile > 0 ? (
          <>
            {constructionTypesOnTile.includes('tree') && (
              <span style={{color: '#007bff', fontWeight: 700, fontSize: 16, verticalAlign: 'middle'}}>
                <span role="img" aria-label="tree">🌳</span> x{constructionTypesOnTile.filter(t => t === 'tree').length}
              </span>
            )}
            {constructionTypesOnTile.includes('flower') && (
              <span style={{color: '#e75480', fontWeight: 700, fontSize: 16, verticalAlign: 'middle', marginLeft: 8}}>
                <span role="img" aria-label="flower">🌼</span> x{constructionTypesOnTile.filter(t => t === 'flower').length}
              </span>
            )}
            {constructionTypesOnTile.includes('settlement') && (
              <span style={{color: '#b8860b', fontWeight: 700, fontSize: 16, verticalAlign: 'middle', marginLeft: 8}}>
                <span role="img" aria-label="settlement">🏠</span> x{constructionTypesOnTile.filter(t => t === 'settlement').length}
              </span>
            )}
          </>
        ) : (
          <span style={{fontSize: 12, color: '#555', fontWeight: 400}}>(No constructions)</span>
        )}
      </div>
      {/* Move cost display */}
      {(!isCurrentUserOnTile) && (
        <div style={{fontSize: 13, marginBottom: 6, color: '#234d20', fontWeight: 500}}>
          Move cost: <span style={{color: '#4e944f', fontWeight: 700}}>{moveCost}</span> RDN balance
        </div>
      )}
      {/* Show insufficient balance message and disable move/attack if not current user on tile */}
      {(!isCurrentUserOnTile && hasInsufficientBalance) && (
        <div style={{ margin: '10px 0' }}>
          <div style={{
            color: '#b71c1c',
            background: 'rgba(255,0,0,0.08)',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.1,
            display: 'inline-block',
          }}>
            Insufficient balance to move.
          </div>
        </div>
      )}
      {isCurrentUserOnTile && (
        <div style={{ margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Build/Upgrade Settlement button (reduced height) */}
          <button
            onClick={
              constructionTypesOnTile.includes('settlement')
                ? () => alert('Upgrade feature coming soon!')
                : handleBuildSettlement
            }
            style={{
              background: '#4e944f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '7px 12px', // reduced height
              fontSize: 12,
              fontWeight: 700,
              width: '100%',
              cursor: (!isBuildingSettlement && balance !== undefined && balance >= settlementCost) ? 'pointer' : 'not-allowed',
              opacity: (!isBuildingSettlement && balance !== undefined && balance >= settlementCost) ? 1 : 0.5,
              boxShadow: '0 2px 8px rgba(34,139,34,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              letterSpacing: 0.5
            }}
            disabled={isBuildingSettlement || balance === undefined || balance < settlementCost}
          >
            <span style={{fontSize: 20, verticalAlign: 'middle'}} role="img" aria-label="settlement">🏠</span>
            {isBuildingSettlement
              ? 'Building...'
              : constructionTypesOnTile.includes('settlement')
                ? 'Upgrade Settlement'
                : `Build Settlement (${settlementCost} RDN)`}
          </button>
          <button
            onClick={handlePlantTree}
            style={{
              background: '#228B22',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '7px 12px', // reduced height
              fontSize: 12,
              fontWeight: 700,
              width: '100%',
              cursor: !isPlanting && balance !== undefined && balance >= plantTreeCost ? 'pointer' : 'not-allowed',
              opacity: !isPlanting && balance !== undefined && balance >= plantTreeCost ? 1 : 0.5,
              boxShadow: '0 2px 8px rgba(34,139,34,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              letterSpacing: 0.5
            }}
            disabled={isPlanting || balance === undefined || balance < plantTreeCost}
          >
            <span style={{fontSize: 20, verticalAlign: 'middle'}} role="img" aria-label="tree">🌳</span>
            {isPlanting ? 'Planting...' : `Plant Tree (${plantTreeCost} RDN)`}
          </button>
          <button
            onClick={handlePlantFlower}
            style={{
              background: '#ff7eb3',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '7px 12px', // reduced height
              fontSize: 12,
              fontWeight: 700,
              width: '100%',
              cursor: !isPlantingFlower && balance !== undefined && balance >= plantFlowerCost ? 'pointer' : 'not-allowed',
              opacity: !isPlantingFlower && balance !== undefined && balance >= plantFlowerCost ? 1 : 0.5,
              boxShadow: '0 2px 8px rgba(34,139,34,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              letterSpacing: 0.5
            }}
            disabled={isPlantingFlower || balance === undefined || balance < plantFlowerCost}
          >
            <span style={{fontSize: 20, verticalAlign: 'middle'}} role="img" aria-label="flower">🌼</span>
            {isPlantingFlower ? 'Planting...' : `Plant Flower (${plantFlowerCost} RDN)`}
          </button>
        </div>
      )}
      {/* Move/Conquer button (merged) */}
      {(!isCurrentUserOnTile) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
          <button
            onClick={enemySettlement && isEnemySettlementAdjacent ? handleConquer : handleMove}
            style={{
              background: enemySettlement && isEnemySettlementAdjacent ? '#b71c1c' : '#4e944f',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '12px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: (
                (enemySettlement && isEnemySettlementAdjacent && !isOtherPlayerOnTile) ||
                (!enemySettlement && !hasInsufficientBalance && !isMoving && !isOtherPlayerOnTile)
              ) ? 'pointer' : 'not-allowed',
              boxShadow: enemySettlement && isEnemySettlementAdjacent ? '0 2px 8px rgba(183,28,28,0.12)' : '0 2px 8px rgba(34,139,34,0.12)',
              transition: 'background 0.2s',
              opacity: (
                (enemySettlement && isEnemySettlementAdjacent && !isOtherPlayerOnTile) ||
                (!enemySettlement && !hasInsufficientBalance && !isMoving && !isOtherPlayerOnTile)
              ) ? 1 : 0.5,
              width: '100%',
              marginTop: 0
            }}
            disabled={
              (enemySettlement && isEnemySettlementAdjacent && isOtherPlayerOnTile) ||
              (!enemySettlement && (hasInsufficientBalance || isMoving || isOtherPlayerOnTile)) ||
              (enemySettlement && !isEnemySettlementAdjacent)
            }
          >
            {enemySettlement && isEnemySettlementAdjacent
              ? `Conquer (${moveCost + conquerCost} RDN)`
              : isMoving ? 'Moving...' : `Move${moveCost ? ` (${moveCost} RDN)` : ''}`}
          </button>
        </div>
      )}
      {(!isCurrentUserOnTile) && enemySettlement && isEnemySettlementAdjacent && conquerProbability !== null && (
        <div style={{ fontSize: 13, marginBottom: 6, color: '#b71c1c', fontWeight: 500 }}>
          Conquer probability: <span style={{ color: '#b71c1c', fontWeight: 700 }}>{(conquerProbability * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(TileModal);
