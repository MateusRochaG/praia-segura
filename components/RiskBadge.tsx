import React from 'react';
import { RiskLevel } from '../types';

interface RiskBadgeProps {
  level: RiskLevel;
  large?: boolean;
}

const RiskBadge: React.FC<RiskBadgeProps> = ({ level, large = false }) => {
  let bgClass = 'bg-gray-100 text-gray-800';
  
  if (level === RiskLevel.HIGH) bgClass = 'bg-red-100 text-red-800 border-red-200';
  else if (level === RiskLevel.MEDIUM) bgClass = 'bg-yellow-100 text-yellow-800 border-yellow-200';
  else if (level === RiskLevel.LOW) bgClass = 'bg-green-100 text-green-800 border-green-200';

  return (
    <span className={`inline-flex items-center justify-center border font-bold rounded-full ${bgClass} ${large ? 'px-4 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'}`}>
      {level === RiskLevel.HIGH && '⚠️ '}
      Risco {level}
    </span>
  );
};

export default RiskBadge;