// Utility functions for population circle and settlement logic

export interface Construction {
  location: [number, number];
  type: string;
  userid?: string | null;
}

export function getUserPopulation(constructions: Construction[], userId: string | null): number {
  if (!userId) return 1;
  return constructions.filter(c => c.type === 'settlement' && c.userid === userId).length || 1;
}

export function getPopulationRadius(tileSize: number, population: number): number {
  const baseRadius = tileSize;
  return baseRadius * (1 + 0.25 * (population - 1));
}

export function isAllySettlement(
  construction: Construction,
  userId: string | null
): boolean {
  return construction.type === 'settlement' && construction.userid === userId;
}

export function isEnemySettlement(
  construction: Construction,
  userId: string | null
): boolean {
  return (
    construction.type === 'settlement' &&
    !!construction.userid &&
    construction.userid !== userId
  );
}

export function getEnemySettlementsWithinRadius(
  constructions: Construction[],
  userId: string | null,
  center: [number, number],
  radius: number,
  tileSize: number,
  offset: { x: number; y: number }
): Construction[] {
  const [centerCol, centerRow] = center;
  const cx = centerCol * tileSize + offset.x + tileSize / 2;
  const cy = centerRow * tileSize + offset.y + tileSize / 2;
  return constructions.filter(c => {
    if (!isEnemySettlement(c, userId)) return false;
    const [col, row] = c.location;
    const tx = col * tileSize + offset.x + tileSize / 2;
    const ty = row * tileSize + offset.y + tileSize / 2;
    const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
    return dist <= radius;
  });
}

export function getAllySettlements(
  constructions: Construction[],
  userId: string | null
): Construction[] {
  return constructions.filter(c => isAllySettlement(c, userId));
}

export function getConquerProbability(
  constructions: Construction[],
  userId: string | null,
  center: [number, number],
  tileSize: number,
  offset: { x: number; y: number }
): number | null {
  if (!userId) return null;
  const userPopulation = getUserPopulation(constructions, userId);
  const radius = getPopulationRadius(tileSize, userPopulation);
  const cx = center[0] * tileSize + offset.x + tileSize / 2;
  const cy = center[1] * tileSize + offset.y + tileSize / 2;
  const userSettlements = getAllySettlements(constructions, userId).filter(c => {
    const [col, row] = c.location;
    const tx = col * tileSize + offset.x + tileSize / 2;
    const ty = row * tileSize + offset.y + tileSize / 2;
    const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2);
    return dist <= radius;
  }).length;
  const enemySettlements = getEnemySettlementsWithinRadius(
    constructions,
    userId,
    center,
    radius,
    tileSize,
    offset
  ).length;
  const total = userSettlements + enemySettlements;
  return total > 0 ? userSettlements / total : null;
}
