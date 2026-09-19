import React, { useState } from 'react';
import {
  Building2,
  Gavel,
  Globe,
  Landmark,
  Shield,
  ArrowRight,
  PlusCircle,
  Sliders,
  X,
  Scale,
} from 'lucide-react';
import { PracticeArea } from '../types';

interface PracticeAreasProps {
  practices: PracticeArea[];
  onOpenCms: () => void;
  onSelectPracticeForIntake?: (practiceTitle: string) => void;
}

export const PracticeAreas: React.FC<PracticeAreasProps> = ({
  practices,
  onOpenCms,
  onSelectPracticeForIntake,
}) => {
  const [selectedPractice, setSelectedPractice] = useState<PracticeArea | null>(null);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Building2':
        return <Building2 className="w-6 h-6 text-[#D4AF37]" />;
      case 'Gavel':
        return <Gavel className="w-6 h-6 text-[#D4AF37]" />;
      case 'Globe':
        return <Globe className="w-6 h-6 text-[#D4AF37]" />;
      case 'Landmark':
        return <Landmark className="w-6 h-6 text-[#D4AF37]" />;
      case 'Shield':
        return <Shield className="w-6 h-6 text-[#D4AF37]" />;
      default:
        return <Scale className="w-6 h-6 text-[#D4AF37]" />;
    }
  };

  return (
    <section
      id="areas-brutais"
      className="w-full py-24 bg-[#0B0305] border-b border-[#431520] relative"
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div>
            <span className="font-data-mono text-xs uppercase tracking-[0.2em] text-[#D4AF37] flex items-center gap-2">
              <span className="w-6 h-px bg-[#D4AF37]"></span> Pilares de Domínio Jurídico
            </span>
            <h2 className="font-display-hero text-3xl md:text-5xl font-bold text-[#FDF9F3] mt-2">
              Arquitetura de Defesa e Soberania
            </h2>
          </div>
          <p className="text-[#A79388] text-sm max-w-md text-left md:text-right font-body-default leading-relaxed">
            Estruturas operadas com discrição absoluta, mobilizando pareceristas titulares de cátedra e defesas de alto calibre.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {practices.map((practice) => (
            <div
              key={practice.id}
              onClick={() => setSelectedPractice(practice)}
              className="bg-gradient-to-b from-[#2E0F17]/60 to-[#180A0E] p-8 rounded-xl border border-[#431520] hover:border-[#D4AF37]/50 transition-all duration-300 group relative cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded bg-[#240A11] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {getIcon(practice.iconName)}
                </div>
                <span className="font-data-mono text-[10px] tracking-widest uppercase text-[#8F785A] block mb-1">
                  {practice.category}
                </span>
                <h3 className="font-display-hero text-2xl font-bold text-[#FDF9F3] mb-4 group-hover:text-[#C5A880] transition-colors">
                  {practice.title}
                </h3>
                <p className="text-sm text-[#E8D8CE] leading-relaxed mb-6 font-light">
                  {practice.description}
                </p>
              </div>

              <div className="pt-4 border-t border-[#431520]/70 flex items-center justify-between text-xs font-data-mono text-[#A79388]">
                <span>LIDERANÇA: {practice.leadership}</span>
                <ArrowRight className="w-4 h-4 text-[#D4AF37] group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}

          {/* White-Label Custom Slot */}
          <div className="bg-[#13060A] p-8 rounded-xl border border-dashed border-[#C5A880]/40 flex flex-col justify-between group">
            <div>
              <div className="inline-flex items-center gap-2 text-[#D4AF37] font-data-mono text-[11px] mb-4">
                <PlusCircle className="w-4 h-4" />
                <span>MÓDULO WHITE-LABEL CUSTOMIZÁVEL</span>
              </div>
              <h3 className="font-display-hero text-2xl font-bold text-[#FDF9F3] mb-2">
                Adicionar Prática Jurisdicional
              </h3>
              <p className="text-xs text-[#A79388] leading-relaxed">
                Este espaço adapta-se à especialidade da sua banca contratante (Direito Minerário, Marítimo, Agronegócio de Exportação ou Propriedade Intelectual).
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenCms}
              className="mt-6 inline-flex items-center gap-2 text-xs font-data-mono text-[#C5A880] hover:text-[#D4AF37] uppercase tracking-wider cursor-pointer"
            >
              <span>Reconfigurar via CMS</span>
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Practice Area Detail Modal */}
      {selectedPractice && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#13060A] border border-[#D4AF37]/50 rounded-2xl max-w-xl w-full p-8 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedPractice(null)}
              className="absolute top-4 right-4 text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-[#D4AF37] font-data-mono text-xs mb-2">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37]"></span>
              <span>{selectedPractice.category}</span>
            </div>

            <h3 className="font-display-hero text-2xl font-bold text-[#FDF9F3] mb-3">
              {selectedPractice.title}
            </h3>

            <p className="text-sm text-[#E8D8CE] leading-relaxed mb-6 font-light">
              {selectedPractice.description}
            </p>

            <div className="space-y-3 bg-[#0B0305] p-4 rounded-lg border border-[#431520] mb-6">
              <div className="flex justify-between text-xs font-data-mono">
                <span className="text-[#A79388]">Perfil Operacional:</span>
                <span className="text-[#D4AF37] font-semibold">{selectedPractice.litigationProfile}</span>
              </div>
              <div className="flex justify-between text-xs font-data-mono">
                <span className="text-[#A79388]">Titular Responsável:</span>
                <span className="text-[#FDF9F3]">{selectedPractice.leadership}</span>
              </div>
              <div className="flex justify-between text-xs font-data-mono">
                <span className="text-[#A79388]">Disponibilidade de Sustentação:</span>
                <span className="text-emerald-400">Ativa perante Cortes e Câmaras</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedPractice(null)}
                className="px-4 py-2 rounded border border-[#431520] text-xs font-data-mono text-[#A79388] hover:text-[#FDF9F3] cursor-pointer"
              >
                Fechar
              </button>
              <a
                href="#audiencia"
                onClick={() => {
                  if (onSelectPracticeForIntake) {
                    onSelectPracticeForIntake(selectedPractice.title);
                  }
                  setSelectedPractice(null);
                }}
                className="px-5 py-2 rounded bg-gradient-to-r from-[#7B1D2E] to-[#3E0C15] border border-[#D4AF37]/50 text-[#FDF9F3] text-xs font-data-mono font-bold uppercase tracking-wider hover:brightness-110"
              >
                Solicitar Parecer Específico
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
