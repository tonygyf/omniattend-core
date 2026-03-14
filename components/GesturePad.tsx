
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

interface GesturePadProps {
  onSequenceChange: (sequence: string) => void;
  highlightColor?: string;
}

const dots = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1,
  row: Math.floor(i / 3),
  col: i % 3,
}));

const GesturePad: React.FC<GesturePadProps> = ({ 
  onSequenceChange,
  highlightColor = '#3b82f6' // blue-600
}) => {
  const [path, setPath] = useState<number[]>([]);
  const [currentLine, setCurrentLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isDrawing = useRef(false);

  // Use a constant for the viewBox size to avoid magic numbers
  const viewBoxSize = 100;
  const gridUnit = viewBoxSize / 3;

  useEffect(() => {
    const handleInteractionEnd = () => {
      if (isDrawing.current) {
        isDrawing.current = false;
        setCurrentLine(null);
        onSequenceChange(path.join('-'));
      }
    };

    window.addEventListener('mouseup', handleInteractionEnd);
    window.addEventListener('touchend', handleInteractionEnd);

    return () => {
      window.removeEventListener('mouseup', handleInteractionEnd);
      window.removeEventListener('touchend', handleInteractionEnd);
    };
  }, [path, onSequenceChange]);

  const getDotCenter = (id: number) => {
    const dot = dots.find(d => d.id === id);
    if (!dot) return { x: 0, y: 0 };
    const x = (dot.col + 0.5) * gridUnit;
    const y = (dot.row + 0.5) * gridUnit;
    return { x, y };
  };

  const getSVGCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Convert pixel coordinates to SVG viewBox coordinates
    const x = ((clientX - rect.left) / rect.width) * viewBoxSize;
    const y = ((clientY - rect.top) / rect.height) * viewBoxSize;
    return { x, y };
  }

  const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    resetPad();
    isDrawing.current = true;
  };

  const handleInteractionMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current) return;
    e.preventDefault();

    const coords = getSVGCoordinates(e);
    if (!coords) return;
    const { x, y } = coords;

    if (path.length > 0) {
      const lastDotCenter = getDotCenter(path[path.length - 1]);
      setCurrentLine({ x1: lastDotCenter.x, y1: lastDotCenter.y, x2: x, y2: y });
    }

    // The radius of the circle is 10 in the 100x100 viewBox. Use this for hit detection.
    const hitRadius = 12; // A bit larger for easier touch

    for (const dot of dots) {
      const dotCenter = getDotCenter(dot.id);
      const distance = Math.sqrt(Math.pow(x - dotCenter.x, 2) + Math.pow(y - dotCenter.y, 2));
      if (distance < hitRadius && !path.includes(dot.id)) {
        setPath(prev => [...prev, dot.id]);
      }
    }
  };

  const resetPad = () => {
    setPath([]);
    onSequenceChange('');
  };

  return (
    <div className="w-full max-w-[240px] mx-auto space-y-3">
      <motion.svg
        ref={svgRef}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="w-full h-auto cursor-pointer touch-none bg-slate-50 rounded-lg border"
        onMouseDown={handleInteractionStart}
        onTouchStart={handleInteractionStart}
        onMouseMove={handleInteractionMove}
        onTouchMove={handleInteractionMove}
      >
        {/* Drawn Path */}
        {path.length > 1 &&
          path.slice(1).map((dotId, index) => {
            const p1 = getDotCenter(path[index]);
            const p2 = getDotCenter(dotId);
            return <line key={index} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={highlightColor} strokeWidth="2" />;
          })}

        {/* Current drawing line */}
        {currentLine && <line {...currentLine} stroke={highlightColor} strokeWidth="2" strokeDasharray="2,2" />}

        {/* Dots */}
        {dots.map(dot => {
          const center = getDotCenter(dot.id);
          const isSelected = path.includes(dot.id);
          return (
            <g key={dot.id}>
              <circle cx={center.x} cy={center.y} r="10" fill={isSelected ? highlightColor : '#e2e8f0'} />
              <circle cx={center.x} cy={center.y} r="4" fill={isSelected ? 'white' : highlightColor} />
            </g>
          );
        })}
      </motion.svg>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600 font-mono bg-slate-100 px-2 py-1 rounded-md min-h-[28px]">
          {path.join('-') || ' '}
        </div>
        <button type="button" onClick={resetPad} className="text-xs text-slate-500 hover:text-slate-800">
          重置
        </button>
      </div>
    </div>
  );
};

export default GesturePad;
