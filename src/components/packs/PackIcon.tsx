import React, { useMemo } from 'react';

interface PackIconProps {
  packId: string;
  packName: string;
  source?: 'community' | 'custom' | 'official' | string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  animate?: boolean;
}

// Simple hash function to generate deterministic values from pack ID
const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

// Generate array of deterministic values from ID
const generateValues = (id: string, count: number): number[] => {
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(hashCode(id + i.toString()) % 100);
  }
  return values;
};

// Color palettes based on source type
const COLOR_PALETTES = {
  community: {
    primary: ['#6366f1', '#818cf8', '#a5b4fc'], // Indigo/Primary
    accent: '#4f46e5',
    glow: 'rgba(99, 102, 241, 0.3)',
  },
  custom: {
    primary: ['#14b8a6', '#2dd4bf', '#5eead4'], // Teal/Tertiary
    accent: '#0d9488',
    glow: 'rgba(20, 184, 166, 0.3)',
  },
  official: {
    primary: ['#f472b6', '#f9a8d4', '#fbcfe8'], // Pink/Secondary
    accent: '#ec4899',
    glow: 'rgba(244, 114, 182, 0.3)',
  },
};

const SIZE_CONFIG = {
  sm: { size: 40, strokeWidth: 2, fontSize: 12 },
  md: { size: 56, strokeWidth: 2.5, fontSize: 14 },
  lg: { size: 72, strokeWidth: 3, fontSize: 16 },
  xl: { size: 96, strokeWidth: 3.5, fontSize: 20 },
};

export const PackIcon: React.FC<PackIconProps> = ({
  packId,
  packName,
  source = 'custom',
  size = 'md',
  className = '',
  animate = true,
}) => {
  const config = SIZE_CONFIG[size];
  const palette = COLOR_PALETTES[source as keyof typeof COLOR_PALETTES] || COLOR_PALETTES.custom;
  
  // Generate deterministic pattern based on pack ID
  const pattern = useMemo(() => {
    const values = generateValues(packId, 20);
    const hash = hashCode(packId);
    
    // Determine pattern type (0-3)
    const patternType = hash % 4;
    
    // Generate shapes based on pattern type
    const shapes: React.ReactNode[] = [];
    const center = config.size / 2;
    const maxRadius = config.size * 0.4;
    
    switch (patternType) {
      case 0: // Concentric rings with segments
        for (let i = 0; i < 3; i++) {
          const radius = maxRadius * (0.4 + i * 0.3);
          const segments = 6 + (values[i] % 6);
          const startAngle = (values[i + 3] / 100) * 360;
          const arcLength = 60 + (values[i + 6] % 120);
          
          for (let j = 0; j < segments; j++) {
            const angle = startAngle + (j * (360 / segments));
            const endAngle = angle + arcLength / segments;
            const startRad = (angle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            
            const x1 = center + radius * Math.cos(startRad);
            const y1 = center + radius * Math.sin(startRad);
            const x2 = center + radius * Math.cos(endRad);
            const y2 = center + radius * Math.sin(endRad);
            
            shapes.push(
              <path
                key={`ring-${i}-${j}`}
                d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={palette.primary[i % 3]}
                strokeWidth={config.strokeWidth}
                strokeLinecap="round"
                opacity={0.6 + (values[i + j] % 40) / 100}
                className={animate ? 'animate-pulse' : ''}
                style={{ animationDelay: `${i * 200}ms`, animationDuration: '3s' }}
              />
            );
          }
        }
        break;
        
      case 1: { // Hexagonal grid pattern
        const hexSize = config.size * 0.15;
        const positions = [
          [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-0.5, -0.866], [0.5, -0.866], [-0.5, 0.866], [0.5, 0.866]
        ];
        positions.forEach(([dx, dy], idx) => {
          const x = center + dx * hexSize * 1.8;
          const y = center + dy * hexSize * 1.8;
          const size = hexSize * (0.6 + (values[idx] % 40) / 100);
          const points = Array.from({ length: 6 }, (_, i) => {
            const angle = (i * 60 - 30) * Math.PI / 180;
            return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
          }).join(' ');
          
          shapes.push(
            <polygon
              key={`hex-${idx}`}
              points={points}
              fill={values[idx] % 2 === 0 ? palette.primary[idx % 3] : 'transparent'}
              stroke={palette.primary[idx % 3]}
              strokeWidth={config.strokeWidth * 0.8}
              opacity={0.5 + (values[idx] % 50) / 100}
              className={animate ? 'animate-pulse' : ''}
              style={{ animationDelay: `${idx * 100}ms`, animationDuration: '4s' }}
            />
          );
        });
        break;
        
      }
      case 2: { // Circuit board / node pattern
        const nodeCount = 5 + (values[0] % 4);
        const nodes: { x: number; y: number }[] = [];
        
        // Generate node positions
        for (let i = 0; i < nodeCount; i++) {
          const angle = (i / nodeCount) * Math.PI * 2 + (values[i] / 100) * 0.5;
          const dist = maxRadius * (0.3 + (values[i + 5] % 70) / 100);
          nodes.push({
            x: center + dist * Math.cos(angle),
            y: center + dist * Math.sin(angle),
          });
        }
        
        // Draw connections
        nodes.forEach((node, i) => {
          const nextNode = nodes[(i + 1) % nodes.length];
          const midNode = nodes[(i + 2) % nodes.length];
          
          if (values[i] % 3 !== 0) {
            shapes.push(
              <line
                key={`line-${i}`}
                x1={node.x}
                y1={node.y}
                x2={nextNode.x}
                y2={nextNode.y}
                stroke={palette.primary[i % 3]}
                strokeWidth={config.strokeWidth * 0.6}
                opacity={0.4}
              />
            );
          }
          if (values[i] % 2 === 0) {
            shapes.push(
              <line
                key={`line2-${i}`}
                x1={node.x}
                y1={node.y}
                x2={midNode.x}
                y2={midNode.y}
                stroke={palette.primary[(i + 1) % 3]}
                strokeWidth={config.strokeWidth * 0.4}
                opacity={0.3}
                strokeDasharray="2,2"
              />
            );
          }
        });
        
        // Draw nodes
        nodes.forEach((node, i) => {
          const nodeSize = config.strokeWidth * (1.5 + (values[i] % 3) * 0.5);
          shapes.push(
            <circle
              key={`node-${i}`}
              cx={node.x}
              cy={node.y}
              r={nodeSize}
              fill={palette.primary[i % 3]}
              opacity={0.8}
              className={animate ? 'animate-pulse' : ''}
              style={{ animationDelay: `${i * 150}ms`, animationDuration: '2s' }}
            />
          );
        });
        
        // Center node
        shapes.push(
          <circle
            key="center-node"
            cx={center}
            cy={center}
            r={config.strokeWidth * 2}
            fill={palette.accent}
            opacity={0.9}
            className={animate ? 'animate-pulse' : ''}
            style={{ animationDuration: '1.5s' }}
          />
        );
        break;
        
      }
      case 3: { // Abstract geometric layers
        const layerCount = 3;
        for (let i = 0; i < layerCount; i++) {
          const layerRadius = maxRadius * (0.5 + i * 0.25);
          const sides = 3 + (values[i] % 4) + i;
          const rotation = (values[i + 3] / 100) * 60;
          
          const points = Array.from({ length: sides }, (_, j) => {
            const angle = ((j / sides) * 360 + rotation) * Math.PI / 180;
            return `${center + layerRadius * Math.cos(angle)},${center + layerRadius * Math.sin(angle)}`;
          }).join(' ');
          
          shapes.push(
            <polygon
              key={`layer-${i}`}
              points={points}
              fill="none"
              stroke={palette.primary[i]}
              strokeWidth={config.strokeWidth}
              opacity={0.5 + i * 0.15}
              className={animate ? '' : ''}
              style={{
                transformOrigin: 'center',
                animation: animate ? `spin ${20 + i * 10}s linear infinite ${i % 2 === 0 ? '' : 'reverse'}` : 'none',
              }}
            />
          );
        }
        
        // Inner detail
        const innerRadius = maxRadius * 0.25;
        shapes.push(
          <circle
            key="inner-circle"
            cx={center}
            cy={center}
            r={innerRadius}
            fill={palette.accent}
            opacity={0.2}
          />,
          <circle
            key="inner-dot"
            cx={center}
            cy={center}
            r={config.strokeWidth * 1.5}
            fill={palette.accent}
            opacity={0.8}
            className={animate ? 'animate-pulse' : ''}
          />
        );
        break;
      }
    }

    return shapes;
  }, [packId, config.size, config.strokeWidth, palette, animate]);

  // Get initials for fallback/overlay
  const initials = packName
    .split(' ')
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: config.size, height: config.size }}
    >
      {/* Main container */}
      <div className="relative w-full h-full rounded-2xl bg-surface-container border border-outline-variant/30 overflow-hidden">

        {/* SVG Pattern */}
        <svg 
          viewBox={`0 0 ${config.size} ${config.size}`} 
          className="absolute inset-0 w-full h-full"
        >
          <defs>
            <style>
              {`
                @keyframes spin {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}
            </style>
          </defs>
          {pattern}
        </svg>
        
        {/* Optional: Initials overlay for additional identification */}
        {size === 'xl' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span 
              className="font-mono font-black opacity-20"
              style={{ fontSize: config.fontSize }}
            >
              {initials}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PackIcon;
