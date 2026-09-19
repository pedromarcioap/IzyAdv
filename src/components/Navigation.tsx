import React from 'react';
import { Scale, ArrowRight } from 'lucide-react';
import { FirmConfig } from '../types';
import { BRAND_ASSETS } from '../data/initialData';

interface NavigationProps {
  firmConfig: FirmConfig;
  onOpenFeeModal: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  firmConfig,
  onOpenFeeModal,
}) => {
  return (
    <header className="relative z-40 bg-[#13060A]/85 backdrop-blur-xl border-b border-[#431520]/60">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 h-24 flex items-center justify-between">
        {/* Brand Seal & Logo */}
        <a href="#tribunal" className="flex items-center gap-4 group">
          <div className="p-2.5 rounded-lg bg-[#240A11]/80 border border-[#C5A880]/30 group-hover:border-[#D4AF37]/60 transition-all">
            <img
              src={BRAND_ASSETS.logoSeal}
              alt={firmConfig.firmName}
              className="h-8 w-auto object-contain brightness-125 contrast-125 filter drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]"
            />
          </div>
          <div className="flex flex-col">
            <span className="font-display-hero text-xl md:text-2xl text-[#FDF9F3] font-bold tracking-tight group-hover:text-[#C5A880] transition-colors">
              {firmConfig.firmName}
            </span>
            <span className="font-data-mono text-[9px] uppercase tracking-[0.25em] text-[#8F785A]">
              {firmConfig.subTitle}
            </span>
          </div>
        </a>

        {/* Sovereign Navlinks */}
        <nav className="hidden xl:flex items-center gap-8 font-data-mono text-xs uppercase tracking-widest text-[#E8D8CE]">
          <a
            href="#tribunal"
            className="hover:text-[#D4AF37] transition-colors flex items-center gap-1.5"
          >
            <span className="w-1 h-1 rounded-full bg-[#C5A880]"></span>
            Estrutura Monumental
          </a>
          <a
            href="#metricas"
            className="hover:text-[#D4AF37] transition-colors"
          >
            Patrimônio & Dados
          </a>
          <a
            href="#areas-brutais"
            className="hover:text-[#D4AF37] transition-colors"
          >
            Núcleos de Força
          </a>
          <a
            href="#socios-dossier"
            className="hover:text-[#D4AF37] transition-colors"
          >
            Dossiê de Sócios
          </a>
          <a
            href="#jurisprudencia"
            className="hover:text-[#D4AF37] transition-colors"
          >
            Law Review
          </a>
        </nav>

        {/* Action Pill & Direct Booking */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenFeeModal}
            className="hidden md:inline-flex items-center gap-2 border border-[#C5A880]/30 hover:border-[#D4AF37] bg-[#240A11]/60 px-4 py-2.5 rounded text-xs font-data-mono tracking-wider text-[#E8D8CE] hover:text-[#D4AF37] transition-all cursor-pointer"
          >
            <Scale className="w-4 h-4 text-[#D4AF37]" />
            <span>CALCULADOR DE HONORÁRIOS</span>
          </button>

          <a
            href="#audiencia"
            className="relative group inline-flex items-center gap-2.5 px-5 py-2.5 rounded bg-gradient-to-r from-[#7B1D2E] via-[#5C1320] to-[#3E0C15] text-[#FDF9F3] border border-[#D4AF37]/40 font-body-default font-semibold text-xs tracking-wider uppercase shadow-[0_0_20px_rgba(212,175,55,0.2)] hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-ping"></span>
            <span>Solicitar Audiência</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform text-[#D4AF37]" />
          </a>
        </div>
      </div>
    </header>
  );
};
