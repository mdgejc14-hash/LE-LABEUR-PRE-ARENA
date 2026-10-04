import React from 'react';

interface EditorialButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'powder';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const EditorialButton: React.FC<EditorialButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-operational font-medium rounded-full transition-all tap-feedback cursor-pointer select-none disabled:opacity-35 disabled:cursor-not-allowed disabled:transform-none';

  const sizeStyles = {
    sm: 'h-9 px-4 text-xs tracking-wider min-h-[36px]',
    md: 'h-12 px-6 text-xs sm:text-sm tracking-wider min-h-[48px]',
    lg: 'h-13 px-8 text-sm sm:text-base tracking-wider min-h-[52px]'
  };

  const variantStyles = {
    primary: 'bg-[#17233B] text-[#F3F3EC] hover:bg-[#17233B]/92 shadow-none border border-transparent active:bg-[#17233B]',
    secondary: 'bg-[#FFFFFF] text-[#17233B] border border-[#17233B]/15 hover:bg-[#F3F3EC] hover:border-[#17233B]/30',
    outline: 'bg-transparent text-[#17233B] border border-[#17233B]/20 hover:border-[#17233B]/50 hover:bg-[#17233B]/5',
    powder: 'bg-[#B5CEDB] text-[#17233B] hover:bg-[#B5CEDB]/85 border border-transparent font-semibold',
    danger: 'bg-[#E23D3D] text-[#FFFFFF] hover:bg-[#E23D3D]/90 border border-transparent'
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
