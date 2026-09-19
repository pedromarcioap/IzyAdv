import React from 'react';
import { FirmConfig } from '../types';
import { BRAND_ASSETS } from '../data/initialData';

interface FooterProps {
  firmConfig: FirmConfig;
}

export const Footer: React.FC<FooterProps> = ({ firmConfig }) => {
  return (
    <footer className="w-full bg-[#0B0305] border-t border-[#431520] py-16 text-[#A79388]">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand Col */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img
                src={BRAND_ASSETS.logoSeal}
                alt={firmConfig.firmName}
                className="h-6 w-auto filter brightness-125 contrast-125"
              />
              <span className="font-display-hero text-lg font-bold text-[#FDF9F3] tracking-tight">
                {firmConfig.firmName}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#A79388]">
              Banca advocatícia de intervenção de alta complexidade. Arbitragem comercial internacional, sustentações nos tribunais superiores e arquitetura fiscal soberana.
            </p>
            <div className="text-[10px] font-data-mono text-[#8F785A] uppercase">
              {firmConfig.oabRegistry}
            </div>
          </div>

          {/* Forense Depts */}
          <div>
            <h4 className="text-xs font-data-mono uppercase tracking-widest text-[#FDF9F3] mb-4">
              Departamentos Forenses
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#areas-brutais" className="hover:text-[#D4AF37] transition-colors">
                  Tribunais Superiores (STF/STJ)
                </a>
              </li>
              <li>
                <a href="#areas-brutais" className="hover:text-[#D4AF37] transition-colors">
                  Câmara de Arbitragem ICC Paris
                </a>
              </li>
              <li>
                <a href="#areas-brutais" className="hover:text-[#D4AF37] transition-colors">
                  Reestruturação e Wealth Planning
                </a>
              </li>
              <li>
                <a href="#areas-brutais" className="hover:text-[#D4AF37] transition-colors">
                  M&A e Auditorias Societárias
                </a>
              </li>
            </ul>
          </div>

          {/* Sedes */}
          <div>
            <h4 className="text-xs font-data-mono uppercase tracking-widest text-[#FDF9F3] mb-4">
              Sedes Oficiais
            </h4>
            <div className="text-xs leading-relaxed text-[#A79388]">
              <strong className="text-[#E8D8CE] block">São Paulo:</strong>
              {firmConfig.sedes.sp.address}
              <br />
              {firmConfig.sedes.sp.neighborhood}, {firmConfig.sedes.sp.cep}
            </div>
            <div className="text-xs leading-relaxed text-[#A79388] mt-3">
              <strong className="text-[#E8D8CE] block">Brasília:</strong>
              {firmConfig.sedes.df.address}
              <br />
              {firmConfig.sedes.df.complex}, {firmConfig.sedes.df.cep}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-data-mono uppercase tracking-widest text-[#FDF9F3] mb-4">
              Gabinete de Atendimento
            </h4>
            <div className="space-y-2 text-xs font-data-mono">
              <div className="text-[#D4AF37]">{firmConfig.sedes.sp.phone}</div>
              <div>{firmConfig.contactEmail}</div>
              <div className="pt-2">
                <span className="inline-block px-2.5 py-1 rounded bg-[#180A0E] border border-[#431520] text-[10px] text-[#A79388]">
                  WHITE-LABEL THEME: DARK LUXURY
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Foot note */}
        <div className="pt-8 border-t border-[#431520] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-data-mono text-[#A79388]">
          <div>
            © 2025 {firmConfig.firmName} Sociedade de Advogados. Todos os direitos reservados.
          </div>
          <div className="flex items-center gap-4">
            <a href="#audiencia" className="hover:text-[#D4AF37] transition-colors">
              Código de Ética OAB
            </a>
            <span>•</span>
            <a href="#audiencia" className="hover:text-[#D4AF37] transition-colors">
              Termos de Sigilo Deontológico
            </a>
            <span>•</span>
            <a href="#audiencia" className="hover:text-[#D4AF37] transition-colors">
              LGPD & Segurança
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
