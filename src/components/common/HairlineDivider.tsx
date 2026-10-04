import React from 'react';

interface HairlineDividerProps {
  className?: string;
  vertical?: boolean;
}

export const HairlineDivider: React.FC<HairlineDividerProps> = ({ className = '', vertical = false }) => {
  if (vertical) {
    return <div className={`w-[1px] bg-[#17233B]/10 self-stretch ${className}`} role="separator" aria-orientation="vertical" />;
  }
  return <div className={`h-[1px] w-full bg-[#17233B]/10 ${className}`} role="separator" aria-orientation="horizontal" />;
};
