import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PartnerDossier } from '../types';
import { Tooltip, HelpTooltip } from './Tooltip';

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
      className="w-full py-24 bg-[var(--theme-surface)] border-b border-[var(--theme-border)] transition-colors duration-300"
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="max-w-3xl mb-16">
          <span className="font-data-mono text-xs uppercase tracking-[0.2em] text-[var(--theme-gold)] flex items-center gap-2">
            <span className="w-6 h-px bg-[var(--theme-gold)]"></span> Liderança Titular
            <HelpTooltip
              title="Registro e Qualificação dos Sócios"
              badge="VERIFICAÇÃO OAB"
              content="Todos os sócios possuem inscrição regular na Ordem dos Advogados do Brasil e titulação de Doutorado ou Mestrado pelas principais faculdades de Direito do país."
            />
          </span>
          <h2 className="font-display-hero text-4xl md:text-5xl font-bold text-[var(--theme-text-main)] mt-2">
            Dossiê dos Sócios Seniores
          </h2>
          <p className="text-[var(--theme-text-muted)] text-base font-light mt-3">
            Juristas com formação doutrinária de ponta, ex-conselheiros de instâncias superiores e autores de obras consagradas na jurisprudência nacional.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="bg-[var(--theme-card)] rounded-2xl border border-[var(--theme-border)] overflow-hidden hover:border-[var(--theme-gold-antique)]/60 transition-all duration-500 shadow-2xl flex flex-col md:flex-row group"
            >
              {/* Portrait Column */}
              <div className="md:w-5/12 relative min-h-[380px] bg-[var(--theme-surface)]">
                <img
                  src={partner.imageUrl}
                  alt={partner.name}
                  className="w-full h-full object-cover object-center filter contrast-110 brightness-95 group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-[var(--theme-card)] via-transparent to-transparent"></div>
                <div className="absolute top-4 left-4 bg-[var(--theme-bg)]/85 backdrop-blur-md px-3 py-1 rounded border border-[var(--theme-gold-antique)]/30">
                  <span className="text-[10px] font-data-mono text-[var(--theme-gold)] font-bold">
                    {partner.role}
                  </span>
                </div>
              </div>

              {/* Bio Column */}
              <div className="md:w-7/12 p-8 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-data-mono text-[var(--theme-gold-antique)] opacity-80 mb-2">
                    <Tooltip
                      title="Registro Profissional na OAB"
                      position="top"
                      badge="CADASTRO NACIONAL"
                      content="Inscrição profissional ativa no Conselho Seccional correspondente."
                    >
                      <span className="cursor-help">{partner.oab}</span>
                    </Tooltip>
                    <span>{partner.chamber}</span>
                  </div>

                  <h3 className="font-display-hero text-2xl font-bold text-[var(--theme-text-main)] mb-1">
                    {partner.name}
                  </h3>

                  <span className="text-xs font-data-mono text-[var(--theme-gold-antique)] block mb-4">
                    {partner.academicTitle}
                  </span>

                  <p className="text-xs text-[var(--theme-text-main)]/90 leading-relaxed font-light mb-6">
                    {partner.bio}
                  </p>

                  {/* Micro Badges */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {partner.awards.map((award, index) => (
                      <div
                        key={index}
                        className="bg-[var(--theme-surface)] p-2.5 rounded border border-[var(--theme-border)] text-[11px]"
                      >
                        <span className="text-[var(--theme-gold)] font-bold block">
                          {award.title}
                        </span>
                        <span className="text-[var(--theme-text-muted)] text-[10px]">
                          {award.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Partner Action Foot */}
                <div className="pt-4 border-t border-[var(--theme-border)] flex items-center justify-between">
                  <Tooltip
                    title="Currículo Lattes CNPq"
                    position="top"
                    badge="PRODUÇÃO ACADÊMICA"
                    content="Identificador no Conselho Nacional de Desenvolvimento Científico e Tecnológico para checagem de publicações e tese de doutorado."
                  >
                    <span className="text-[11px] font-data-mono text-[var(--theme-text-muted)] cursor-help">
                      LATTES: {partner.lattesId}
                    </span>
                  </Tooltip>

                  <Tooltip
                    title="Agendar Audiência Direta"
                    position="top"
                    badge="GABINETE DO SÓCIO"
                    content="Abre a janela de agendamento reservado para reuniões presenciais ou teleconferência direta com o sócio titular."
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPartnerForSchedule(partner)}
                      className="text-xs font-data-mono text-[var(--theme-gold)] hover:text-[var(--theme-gold-antique)] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <span>CONSULTAR AGENDA</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

