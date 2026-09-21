import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Info } from 'lucide-react';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Título didático/explicativo do Tooltip */
  title?: string;
  /** Conteúdo detalhado e explicativo da funcionalidade */
  content: React.ReactNode;
  /** Posição relativa ao elemento alvo (padrão: 'top') */
  position?: TooltipPosition;
  /** Rótulo da badge explicativa (ex: "COMO FUNCIONA", "GUIA DIDÁTICO") */
  badge?: string;
  /** Elemento sobre o qual o tooltip será ativado */
  children: React.ReactNode;
  /** Classe CSS adicional para o wrapper do tooltip */
  className?: string;
  /** Se deve ser ativado apenas no modo interativo/clique */
  clickToToggle?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  title,
  content,
  position = 'top',
  badge = 'COMO FUNCIONA',
  children,
  className = '',
  clickToToggle = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(true), 120);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(false), 100);
  };

  const toggleTooltip = () => {
    setIsVisible((prev) => !prev);
  };

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsVisible(false);
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  // Position classes
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom':
        return 'top-full mt-2.5 left-1/2 -translate-x-1/2 origin-top';
      case 'left':
        return 'right-full mr-2.5 top-1/2 -translate-y-1/2 origin-right';
      case 'right':
        return 'left-full ml-2.5 top-1/2 -translate-y-1/2 origin-left';
      case 'top':
      default:
        return 'bottom-full mb-2.5 left-1/2 -translate-x-1/2 origin-bottom';
    }
  };

  // Arrow classes
  const getArrowClasses = () => {
    switch (position) {
      case 'bottom':
        return '-top-1.5 left-1/2 -translate-x-1/2 border-t-transparent border-l-transparent border-r-transparent border-b-[#D4AF37]/60';
      case 'left':
        return '-right-1.5 top-1/2 -translate-y-1/2 border-b-transparent border-t-transparent border-r-transparent border-l-[#D4AF37]/60';
      case 'right':
        return '-left-1.5 top-1/2 -translate-y-1/2 border-b-transparent border-t-transparent border-l-transparent border-r-[#D4AF37]/60';
      case 'top':
      default:
        return '-bottom-1.5 left-1/2 -translate-x-1/2 border-b-transparent border-l-transparent border-r-transparent border-t-[#D4AF37]/60';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={clickToToggle ? undefined : showTooltip}
      onMouseLeave={clickToToggle ? undefined : hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onClick={clickToToggle ? toggleTooltip : undefined}
    >
      {children}

      {isVisible && (
        <div
          role="tooltip"
          className={`absolute z-[9999] w-72 sm:w-80 p-4 rounded-xl bg-[#13060A]/95 text-[#FDF9F3] border border-[#D4AF37]/70 shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-all duration-200 animate-in fade-in zoom-in-95 pointer-events-auto ${getPositionClasses()}`}
        >
          {/* Arrow */}
          <div className={`absolute w-0 h-0 border-4 ${getArrowClasses()}`} />

          {/* Header & Didactic Badge */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#431520]">
            <div className="flex items-center gap-1.5 text-[#D4AF37] text-xs font-bold font-data-mono tracking-wider">
              <Info className="w-3.5 h-3.5 shrink-0 text-[#D4AF37]" />
              <span>{title || 'Funcionalidade Explícita'}</span>
            </div>
            {badge && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-data-mono font-bold uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/15 border border-[#D4AF37]/30">
                {badge}
              </span>
            )}
          </div>

          {/* Explanatory Didactic Content */}
          <div className="text-xs text-[#E8D8CE] leading-relaxed font-light space-y-1.5">
            {typeof content === 'string' ? <p>{content}</p> : content}
          </div>
        </div>
      )}
    </div>
  );
};

export interface HelpTooltipProps {
  title: string;
  content: React.ReactNode;
  position?: TooltipPosition;
  badge?: string;
  icon?: 'help' | 'info';
  className?: string;
}

/**
 * Ícone discreto de ajuda (i) que exibe um tooltip explicativo e didático ao passar o mouse ou tocar.
 */
export const HelpTooltip: React.FC<HelpTooltipProps> = ({
  title,
  content,
  position = 'top',
  badge = 'GUIA DIDÁTICO',
  icon = 'help',
  className = '',
}) => {
  const IconComponent = icon === 'help' ? HelpCircle : Info;

  return (
    <Tooltip title={title} content={content} position={position} badge={badge} className={className}>
      <button
        type="button"
        className="inline-flex items-center justify-center p-0.5 rounded-full text-[#D4AF37]/80 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors cursor-help focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
        aria-label={`Ajuda: ${title}`}
      >
        <IconComponent className="w-4 h-4 shrink-0" />
      </button>
    </Tooltip>
  );
};
