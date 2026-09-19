import React from 'react';
import { FirmConfig } from '../types';
import { BRAND_ASSETS } from '../data/initialData';

interface FooterProps {
  firmConfig: FirmConfig;
}

export const Footer: React.FC<FooterProps> = ({ firmConfig }) => {
  return (
    <footer className="w-full bg-[var(--theme-bg)] border-t border-[var(--theme-border)] py-16 text-[var(--theme-text-muted)] transition-colors duration-300">
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
              <span className="font-display-hero text-lg font-bold text-[var(--theme-text-main)] tracking-tight">
                {firmConfig.firmName}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--theme-text-muted)]">
              Banca advocatícia de intervenção de alta complexidade. Arbitragem comercial internacional, sustentações nos tribunais superiores e arquitetura fiscal soberana.
            </p>
            <div className="text-[10px] font-data-mono text-[var(--theme-gold-antique)] uppercase">
              {firmConfig.oabRegistry}
            </div>
          </div>

          {/* Forense Depts */}
          <div>
            <h4 className="text-xs font-data-mono uppercase tracking-widest text-[var(--theme-text-main)] mb-4">
              Departamentos Forenses
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#areas-brutais" className="hover:text-[var(--theme-gold)] transition-colors">
                  Tribunais Superiores (STF/STJ)
                </a>
              </li>
              <li>
                <a href="#areas-brutais" className="hover:text-[var(--theme-gold)] transition-colors">
                  Câmara de Arbitragem ICC Paris
                </a>
              </li>
              <li>
                <a href="#areas-brutais" className="hover:text-[var(--theme-gold)] transition-colors">
                  Reestruturação e Wealth Planning
                </a>
              </li>
              <li>
                <a href="#areas-brutais" className="hover:text-[var(--theme-gold)] transition-colors">
                  M&A e Auditorias Societárias
                </a>
              </li>
            </ul>
          </div>

          {/* Sedes */}
          <div>
            <h4 className="text-xs font-data-mono uppercase tracking-widest text-[var(--theme-text-main)] mb-4">
              Sedes Oficiais
            </h4>
            <div className="text-xs leading-relaxed text-[var(--theme-text-muted)]">
              <strong className="text-[var(--theme-text-main)] block">São Paulo:</strong>
              {firmConfig.sedes.sp.address}
              <br />
              {firmConfig.sedes.sp.neighborhood}, {firmConfig.sedes.sp.cep}
            </div>
            <div className="text-xs leading-relaxed text-[var(--theme-text-muted)] mt-3">
              <strong className="text-[var(--theme-text-main)] block">Brasília:</strong>
              {firmConfig.sedes.df.address}
              <br />
              {firmConfig.sedes.df.complex}, {firmConfig.sedes.df.cep}
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-xs font-data-mono uppercase tracking-widest text-[var(--theme-text-main)] mb-4">
              Gabinete de Atendimento
            </h4>
            <div className="space-y-2 text-xs font-data-mono">
              <div className="text-[var(--theme-gold)]">{firmConfig.sedes.sp.phone}</div>
              <div>{firmConfig.contactEmail}</div>
              <div className="pt-2">
                <span className="inline-block px-2.5 py-1 rounded bg-[var(--theme-card)] border border-[var(--theme-border)] text-[10px] text-[var(--theme-text-muted)]">
                  WHITE-LABEL THEME: DYNAMIC ACCENT
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Foot note */}
        <div className="pt-8 border-t border-[var(--theme-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-data-mono text-[var(--theme-text-muted)]">
          <div>
            © 2025 {firmConfig.firmName} Sociedade de Advogados. Todos os direitos reservados.
          </div>
          <div className="flex items-center gap-4">
            <a href="#audiencia" className="hover:text-[var(--theme-gold)] transition-colors">
              Código de Ética OAB
            </a>
            <span>•</span>
            <a href="#audiencia" className="hover:text-[var(--theme-gold)] transition-colors">
              Termos de Sigilo Deontológico
            </a>
            <span>•</span>
            <a href="#audiencia" className="hover:text-[var(--theme-gold)] transition-colors">
              LGPD & Segurança
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
