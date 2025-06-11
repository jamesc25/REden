// Refactored for clarity and maintainability: improved variable names and concise comments.
import React from "react";
import { useMap } from '../providers/Grids';

export interface StatusBarProps {
  hoverCoord: [number, number] | null;
}

export const StatusBar = React.memo(function StatusBar({ hoverCoord }: StatusBarProps) {
  const { zoom } = useMap();
  return (
    <div
      className="fixed bottom-0 left-0 w-full bg-gradient-to-r from-green-700 via-green-500 to-green-300 text-emerald-950 text-[10px] font-mono px-2 py-1 z-40 select-text border-t border-green-800 shadow-lg shadow-green-200/30 flex justify-between items-center"
      style={{ userSelect: "text", pointerEvents: "auto", borderTopLeftRadius: 0, borderTopRightRadius: 0, minHeight: '18px' }}
    >
      <div>
        {hoverCoord ? (
          <span className="ml-4">🌱 ({hoverCoord[0]}, {hoverCoord[1]})</span>
        ) : (
          <span className="ml-4">🌸 Hover a tile to see its coordinate</span>
        )}
      </div>
      <span className="mr-2">🔍 Zoom: {zoom.toFixed(2)}x</span>
    </div>
  );
});
