import React, { useState } from 'react';
import logoDefault from '../../assets/brand/logo.svg';
import logoLight from '../../assets/brand/logo-light.svg';
import logoMark from '../../assets/brand/logo-mark.svg';

export interface BrandLogoProps {
  variant?: 'default' | 'light' | 'mark';
  className?: string;
  alt?: string;
  onClick?: () => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'default',
  className = '',
  alt = "LE LABEUR — Accord Clair & Métiers au Bénin",
  onClick
}) => {
  const [hasError, setHasError] = useState(false);
  let src = logoDefault;
  if (variant === 'light') {
    src = logoLight;
  } else if (variant === 'mark') {
    src = logoMark;
  }

  const defaultDimClass = variant === 'mark' ? 'h-10 w-10' : 'h-10 w-auto';

  if (hasError) {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center gap-2 font-editorial font-bold tracking-wider select-none ${
          variant === 'light' ? 'text-[#F3F3EC]' : 'text-[#17233B]'
        } ${className}`}
      >
        <span className="w-8 h-8 rounded bg-[#C5A059] flex items-center justify-center text-[#17233B] text-xs font-mono font-bold">
          L
        </span>
        <span className="text-xl">LE LABEUR</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      onError={() => setHasError(true)}
      className={`object-contain select-none transition-opacity ${defaultDimClass} ${className}`}
      loading="eager"
    />
  );
};
