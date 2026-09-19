import React from 'react';
import { Landmark, Award, Network, PieChart } from 'lucide-react';

export const StatsStrip: React.FC = () => {
  return (
    <section id="metricas" className="w-full bg-[var(--theme-surface)] border-b border-[var(--theme-border)] py-12 transition-colors duration-300">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[var(--theme-card)] p-6 rounded-lg border border-[var(--theme-border)] hover:border-[var(--theme-gold-antique)]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[var(--theme-gold-antique)]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Volume em Litígio
              </span>
              <Landmark className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[var(--theme-text-main)] group-hover:text-[var(--theme-gold)] transition-colors">
              R$ 4.2 Bi
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-2 leading-relaxed">
              Valores defendidos em causas tributárias, societárias e desapropriações.
            </p>
          </div>

          <div className="bg-[var(--theme-card)] p-6 rounded-lg border border-[var(--theme-border)] hover:border-[var(--theme-gold-antique)]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[var(--theme-gold-antique)]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Precedentes Fixados
              </span>
              <Award className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[var(--theme-text-main)] group-hover:text-[var(--theme-gold)] transition-colors">
              114 Teses
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-2 leading-relaxed">
              Súmulas e teses vencedoras registradas nos anais do STJ e Tribunais Regionais.
            </p>
          </div>

          <div className="bg-[var(--theme-card)] p-6 rounded-lg border border-[var(--theme-border)] hover:border-[var(--theme-gold-antique)]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[var(--theme-gold-antique)]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Câmaras Arbitrais
              </span>
              <Network className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[var(--theme-text-main)] group-hover:text-[var(--theme-gold)] transition-colors">
              ICC & CAM
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-2 leading-relaxed">
              Arbitragens internacionais confidenciais conduzidas em Paris, Genebra e SP.
            </p>
          </div>

          <div className="bg-[var(--theme-card)] p-6 rounded-lg border border-[var(--theme-border)] hover:border-[var(--theme-gold-antique)]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[var(--theme-gold-antique)]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Acordo Estratégico
              </span>
              <PieChart className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[var(--theme-gold)]">
              87% Taxa
            </div>
            <p className="text-xs text-[var(--theme-text-muted)] mt-2 leading-relaxed">
              Resoluções prévias e transações tributárias sem exposição mediática.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
