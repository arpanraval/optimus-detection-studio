import React from 'react';

interface CircularProgressProps {
  score?: number;
  value?: number;  // Alias for score - for backwards compatibility
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({ 
  score, 
  value,
  size = 40, 
  strokeWidth = 3,
  showLabel = true
}) => {
  // Use score if provided, otherwise fall back to value, then 0
  const displayScore = score ?? value ?? 0;
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (displayScore / 100) * circumference;
  
  let color = 'text-red-500'; 
  if (displayScore >= 80) color = 'text-emerald-500';
  else if (displayScore >= 60) color = 'text-blue-500';
  else if (displayScore >= 40) color = 'text-yellow-500';
  else if (displayScore >= 20) color = 'text-orange-500';

  return (
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 w-full h-full overflow-visible">
            {/* Track */}
            <circle
                className="text-surface-variant opacity-20"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                fill="transparent"
                r={radius}
                cx={size / 2}
                cy={size / 2}
            />
            {/* Progress */}
            <circle
                className={`${color} transition-all duration-1000 ease-out`}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="transparent"
                r={radius}
                cx={size / 2}
                cy={size / 2}
                style={{
                    strokeDasharray: circumference,
                    strokeDashoffset: offset
                }}
            />
        </svg>
        {showLabel && (
          <div className="absolute flex flex-col items-center justify-center">
             <span className={`text-sm font-bold ${color}`}>{displayScore}</span>
          </div>
        )}
      </div>
  );
};