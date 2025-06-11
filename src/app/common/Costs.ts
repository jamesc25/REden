// Common move cost calculation for both UI and backend logic
export function getMoveCost(from: [number, number], to: [number, number]): number {
  // Minimum 0.0001, increase by 0.00003 per tile of Manhattan distance
  if (!Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) return 0.0001;
  const distance = Math.abs(from[0] - to[0]) + Math.abs(from[1] - to[1]);
  return Math.max(1, 1 * distance);
}

export function getPlantTreeCost(): number {
  return 30;
}

export function getSettlementCost() {
  // You can adjust this value as needed
  return 100;
}

export function getPlantFlowerCost(): number {
  // Set the cost for planting a flower (adjust as needed)
  return 10;
}

export function getConquerCost(): number {
  // Set the cost for conquering a settlement (adjust as needed)
  return 50;
}
