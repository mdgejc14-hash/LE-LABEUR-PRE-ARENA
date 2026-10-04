import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface EditorialSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const EditorialSheet: React.FC<EditorialSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#17233B]/60 transition-opacity duration-250 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet Panel */}
      <div 
        className="relative z-10 w-full max-h-[90vh] bg-[#F3F3EC] rounded-t-[8px] border-t border-[#17233B]/20 flex flex-col shadow-2xl transition-transform duration-250 ease-out"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
      >
        {/* Grab Handle */}
        <div className="w-full flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-[#17233B]/20 rounded-full" />
        </div>
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#17233B]/10 flex items-center justify-between">
          <div>
            <h2 id="sheet-title" className="font-editorial text-xl font-semibold text-[#17233B] tracking-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs font-operational text-[#17233B]/60 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 flex items-center justify-center rounded-full text-[#17233B]/60 hover:text-[#17233B] hover:bg-[#17233B]/5 tap-feedback"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Body content */}
        <div className="px-5 py-4 overflow-y-auto no-scrollbar flex-1 font-operational">
          {children}
        </div>
        {/* Optional Footer */}
        {footer && (
          <div className="p-4 border-t border-[#17233B]/10 bg-[#F3F3EC]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
