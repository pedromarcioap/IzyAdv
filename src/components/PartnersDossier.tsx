import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PartnerDossier } from '../types';

interface PartnersDossierProps {
  partners: PartnerDossier[];
  onSelectPartnerForSchedule: (partner: PartnerDossier) => void;
}

export const PartnersDossier: React.FC<PartnersDossierProps> = ({
  partners,
  onSelectPartnerForSchedule,
}) => {
  return (
    <section
      id="socios-dossier"
      className="w-full py-24 bg-[#180A0E] border-b border-[#431520]"
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="max-w-3xl mb-16">
          <span className="font-data-mono text-xs uppercase tracking-[0.2em] text-[#D4AF37] flex items-center gap-2">
            <span className="w-6 h-px bg-[#D4AF37]"></span> Liderança Titular
          </span>
          <h2 className="font-display-hero text-4xl md:text-5xl font-bold text-[#FDF9F3] mt-2">
            Dossiê dos Sócios Seniores
          </h2>
          <p className="text-[#A79388] text-base font-light mt-3">
            Juristas com formação doutrinária de ponta, ex-conselheiros de instâncias superiores e autores de obras consagradas na jurisprudência nacional.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="bg-[#13060A] rounded-2xl border border-[#431520] overflow-hidden hover:border-[#C5A880]/60 transition-all duration-500 shadow-2xl flex flex-col md:flex-row group"
            >
              {/* Portrait Column */}
              <div className="md:w-5/12 relative min-h-[380px] bg-[#240A11]">
                <img
                  src={partner.imageUrl}
                  alt={partner.name}
                  className="w-full h-full object-cover object-center filter contrast-110 brightness-95 group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[#13060A] via-transparent to-transparent"></div>
                <div className="absolute top-4 left-4 bg-[#0B0305]/80 backdrop-blur-md px-3 py-1 rounded border border-[#C5A880]/30">
                  <span className="text-[10px] font-data-mono text-[#D4AF37] font-bold">
                    {partner.role}
                  </span>
                </div>
              </div>

              {/* Bio Column */}
              <div className="md:w-7/12 p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-data-mono text-[#8F785A] mb-2">
                    <span>{partner.oab}</span>
                    <span>{partner.chamber}</span>
                  </div>

                  <h3 className="font-display-hero text-2xl font-bold text-[#FDF9F3] mb-1">
                    {partner.name}
                  </h3>

                  <span className="text-xs font-data-mono text-[#C5A880] block mb-4">
                    {partner.academicTitle}
                  </span>

                  <p className="text-xs text-[#E8D8CE] leading-relaxed font-light mb-6">
                    {partner.bio}
                  </p>

                  {/* Micro Badges */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {partner.awards.map((award, index) => (
                      <div
                        key={index}
                        className="bg-[#180A0E] p-2.5 rounded border border-[#431520] text-[11px]"
                      >
                        <span className="text-[#D4AF37] font-bold block">
                          {award.title}
                        </span>
                        <span className="text-[#A79388] text-[10px]">
                          {award.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Partner Action Foot */}
                <div className="pt-4 border-t border-[#431520] flex items-center justify-between">
                  <span className="text-[11px] font-data-mono text-[#A79388]">
                    LATTES: {partner.lattesId}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectPartnerForSchedule(partner)}
                    className="text-xs font-data-mono text-[#D4AF37] hover:text-[#C5A880] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>CONSULTAR AGENDA</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
