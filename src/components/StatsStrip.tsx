import React from 'react';
import { Landmark, Award, Network, PieChart } from 'lucide-react';

export const StatsStrip: React.FC = () => {
  return (
    <section id="metricas" className="w-full bg-[#180A0E] border-b border-[#431520] py-12">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-[#13060A] p-6 rounded-lg border border-[#431520] hover:border-[#C5A880]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[#C5A880]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Volume em Litígio
              </span>
              <Landmark className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[#FDF9F3] group-hover:text-[#D4AF37] transition-colors">
              R$ 4.2 Bi
            </div>
            <p className="text-xs text-[#A79388] mt-2 leading-relaxed">
              Valores defendidos em causas tributárias, societárias e desapropriações.
            </p>
          </div>

          <div className="bg-[#13060A] p-6 rounded-lg border border-[#431520] hover:border-[#C5A880]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[#C5A880]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Precedentes Fixados
              </span>
              <Award className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[#FDF9F3] group-hover:text-[#D4AF37] transition-colors">
              114 Teses
            </div>
            <p className="text-xs text-[#A79388] mt-2 leading-relaxed">
              Súmulas e teses vencedoras registradas nos anais do STJ e Tribunais Regionais.
            </p>
          </div>

          <div className="bg-[#13060A] p-6 rounded-lg border border-[#431520] hover:border-[#C5A880]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[#C5A880]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Câmaras Arbitrais
              </span>
              <Network className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[#FDF9F3] group-hover:text-[#D4AF37] transition-colors">
              ICC & CAM
            </div>
            <p className="text-xs text-[#A79388] mt-2 leading-relaxed">
              Arbitragens internacionais confidenciais conduzidas em Paris, Genebra e SP.
            </p>
          </div>

          <div className="bg-[#13060A] p-6 rounded-lg border border-[#431520] hover:border-[#C5A880]/50 transition-all group">
            <div className="flex items-center justify-between mb-3 text-[#C5A880]">
              <span className="font-data-mono text-[11px] uppercase tracking-wider">
                Acordo Estratégico
              </span>
              <PieChart className="w-5 h-5" />
            </div>
            <div className="font-display-hero text-3xl font-bold text-[#D4AF37]">
              87% Taxa
            </div>
            <p className="text-xs text-[#A79388] mt-2 leading-relaxed">
              Resoluções prévias e transações tributárias sem exposição mediática.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
