import React from 'react';
import { Landmark, Shield, ChevronDown, Lock, Scale } from 'lucide-react';
import { FirmConfig } from '../types';
import { BRAND_ASSETS } from '../data/initialData';
import { Tooltip, HelpTooltip } from './Tooltip';

interface HeroSectionProps {
  firmConfig: FirmConfig;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ firmConfig }) => {
  return (
    <section
      id="tribunal"
      className="relative min-h-[92vh] flex items-center justify-center overflow-hidden border-b border-[var(--theme-border)] transition-colors duration-300"
    >
      {/* Full Bleed Architectural Photography Hero Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={BRAND_ASSETS.heroTribunal}
          alt="Tribunal Monumental"
          className="w-full h-full object-cover object-center filter brightness-[0.42] contrast-[1.18] scale-[1.02] transform transition-transform duration-1000"
        />
        {/* Multi-layer brutalist gradient washes */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--theme-bg)] via-[var(--theme-bg)]/75 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--theme-bg)]/90 via-transparent to-[var(--theme-bg)]/90"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08)_0%,transparent_70%)] opacity-30"></div>
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 py-20 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Text Content: Grandeur & Authority */}
          <div className="lg:col-span-8 flex flex-col items-start">
            <div className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded bg-[var(--theme-surface)]/80 border border-[var(--theme-gold-antique)]/30 backdrop-blur-md mb-6">
              <Landmark className="w-4 h-4 text-[var(--theme-gold)]" />
              <span className="font-data-mono text-[11px] uppercase tracking-widest text-[var(--theme-text-main)]">
                Soberania Forense & Defesa Corporativa Implacável
              </span>
              <HelpTooltip
                title="Atuação em Cortes Superiores & Arbitragem"
                badge="ESPECIALIZAÇÃO"
                content="Representação exclusiva em litígios societários e tributários perante STF, STJ e Câmaras Internacionais de Arbitragem (ICC Paris e CAM-CCBC)."
              />
            </div>

            <h1 className="font-display-hero text-4xl sm:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight text-[var(--theme-text-main)] mb-6">
              A Fortaleza Dogmática dos <br />
              <span className="italic font-normal bg-gradient-to-r from-[var(--theme-gold)] via-[#F5E5C0] to-[var(--theme-gold-antique)] bg-clip-text text-transparent drop-shadow-sm">
                Tribunais Superiores
              </span>{' '}
              & Ativos Soberanos.
            </h1>

            <p className="text-[var(--theme-text-main)] opacity-90 text-lg sm:text-xl font-light leading-relaxed max-w-3xl mb-10 text-justify">
              Doutrina austera, blindagem patrimonial sem precedentes e intervenções decisivas perante o{' '}
              <strong className="text-[var(--theme-text-main)] font-medium">STF, STJ</strong> e Câmaras Internacionais de Arbitragem ({' '}
              <strong className="text-[var(--theme-text-main)] font-medium">ICC Paris & CAM-CCBC</strong>).
            </p>

            {/* Dual Luxury CTAs */}
            <div className="flex flex-wrap items-center gap-5 w-full sm:w-auto">
              <Tooltip
                title="Solicitação de Audiência Reservada"
                position="top"
                badge="AGENDAMENTO DIRETO"
                content="Abre o protocolo confidencial de entrada para agendamento direto com o gabinete de sócios titulares, com triagem garantida em até 4 horas úteis."
              >
                <a
                  href="#audiencia"
                  style={{ background: 'var(--theme-button-gradient)' }}
                  className="px-8 py-4 rounded border border-[var(--theme-gold)]/60 text-[var(--theme-text-main)] font-medium text-sm tracking-widest uppercase flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(212,175,55,0.25)] hover:shadow-[0_0_40px_rgba(212,175,55,0.45)] hover:border-[var(--theme-gold)] transition-all duration-300 cursor-pointer"
                >
                  <Shield className="w-5 h-5 text-[var(--theme-gold)]" />
                  <span>Solicitar Audiência Reservada</span>
                </a>
              </Tooltip>

              <Tooltip
                title="Exame do Quadro de Sócios"
                position="top"
                badge="CORPO DOCENTE & TITULARES"
                content="Navegue até a seção dos sócios seniores para verificar qualificações acadêmicas, titulações, registros OAB e histórico de despachos."
              >
                <a
                  href="#socios-dossier"
                  className="px-8 py-4 rounded bg-[var(--theme-card)]/80 hover:bg-[var(--theme-surface)]/80 border border-[var(--theme-border)] text-[var(--theme-text-main)] hover:text-[var(--theme-gold)] font-data-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all backdrop-blur-md cursor-pointer"
                >
                  <span>Examinar Banca de Sócios</span>
                  <ChevronDown className="w-4 h-4" />
                </a>
              </Tooltip>
            </div>

            {/* Oath and Seal Strip */}
            <div className="mt-12 pt-6 border-t border-[var(--theme-border)]/70 flex flex-wrap items-center gap-y-3 gap-x-8 font-data-mono text-[11px] text-[var(--theme-text-muted)] uppercase tracking-wider">
              <Tooltip
                title="Garantia Ética de Sigilo"
                position="top"
                badge="ESTATUTO DA OAB"
                content="Proteção integral de sigilo profissional estabelecida pelo Regulamento Geral da Ordem dos Advogados do Brasil."
              >
                <span className="flex items-center gap-2 cursor-help">
                  <Lock className="w-3.5 h-3.5 text-[var(--theme-gold-antique)]" />
                  Sigilo Absoluto • Provimento OAB 205/2021
                </span>
              </Tooltip>
              <span className="text-[var(--theme-border)] hidden md:inline">|</span>

              <Tooltip
                title="Checagem Sistêmica Anti-Conflito"
                position="top"
                badge="AUDITORIA PRÉVIA"
                content="Verificação automatizada antes de cada atendimento para garantir a inexistência de conflito de interesses com clientes correntes da banca."
              >
                <span className="flex items-center gap-2 cursor-help">
                  <Shield className="w-3.5 h-3.5 text-[var(--theme-gold-antique)]" />
                  Prevenção Anti-Conflito Automatizada
                </span>
              </Tooltip>
              <span className="text-[var(--theme-border)] hidden md:inline">|</span>

              <Tooltip
                title="Defesa Oral perante Ministros"
                position="top"
                badge="TRIBUNAIS SUPERIORES"
                content="Sustentações presenciais e memoriais entregues em mãos aos ministros relatores e desembargadores em Brasília e São Paulo."
              >
                <span className="flex items-center gap-2 cursor-help">
                  <Scale className="w-3.5 h-3.5 text-[var(--theme-gold-antique)]" />
                  Sustentação Oral Privada nos Tribunais
                </span>
              </Tooltip>
            </div>
          </div>

          {/* Hero Floating Monolith Card */}
          <div className="lg:col-span-4 relative">
            <div className="relative bg-gradient-to-b from-[var(--theme-surface)]/90 to-[var(--theme-card)]/95 border border-[var(--theme-gold-antique)]/30 rounded-xl p-6 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-[var(--theme-border)]/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--theme-gold)]"></span>
                  <span className="font-data-mono text-xs font-semibold text-[var(--theme-text-main)] uppercase tracking-widest">
                    Painel Soberano
                  </span>
                </div>
                <span className="text-[10px] font-data-mono text-[var(--theme-gold-antique)] bg-[var(--theme-gold-antique)]/10 px-2 py-0.5 rounded border border-[var(--theme-gold-antique)]/20">
                  WL-LIVE
                </span>
              </div>

              {/* Live Chamber Metric */}
              <div className="py-6 flex flex-col gap-5">
                <Tooltip
                  title="Valor Total sob Gestão Forense"
                  position="left"
                  badge="ATALHO EXPLICATIVO"
                  content="Montante acumulado de contingências fiscais, ações anulatórias e litígios societários patrocinados pela banca."
                >
                  <div className="bg-[var(--theme-bg)]/60 p-4 rounded-lg border border-[var(--theme-border)] cursor-help">
                    <span className="text-[10px] font-data-mono uppercase tracking-widest text-[var(--theme-text-muted)] block mb-1">
                      Litígios Ativos Conduzidos
                    </span>
                    <div className="font-display-hero text-4xl text-[var(--theme-gold)] font-bold">
                      {firmConfig.activeLitigationValue}
                    </div>
                    <span className="text-xs text-[var(--theme-text-main)]/80 mt-1 block">
                      Proteção e repatriação patrimonial em arbitragem e contencioso.
                    </span>
                  </div>
                </Tooltip>

                <div className="grid grid-cols-2 gap-3">
                  <Tooltip
                    title="Índice de Admissibilidade em Recursos"
                    position="top"
                    badge="MÉTRICA AUDITADA"
                    content="Percentual de provimento e conhecimento de Recursos Especiais e Extraordinários perante o STJ e STF."
                  >
                    <div className="bg-[var(--theme-bg)]/60 p-3.5 rounded border border-[var(--theme-border)] cursor-help">
                      <span className="text-[10px] font-data-mono text-[var(--theme-text-muted)] block">
                        Êxito STF / STJ
                      </span>
                      <span className="font-display-hero text-2xl font-bold text-[var(--theme-text-main)] mt-0.5 block">
                        {firmConfig.successRate}
                      </span>
                      <span className="text-[10px] text-[var(--theme-gold-antique)]">
                        Admissibilidade Plena
                      </span>
                    </div>
                  </Tooltip>

                  <Tooltip
                    title="Histórico Institucional Ininterrupto"
                    position="top"
                    badge="TRADIÇÃO"
                    content="Tempo de atuação continuada com acervo jurisprudencial e jurisprudência consolidada desde 1997."
                  >
                    <div className="bg-[var(--theme-bg)]/60 p-3.5 rounded border border-[var(--theme-border)] cursor-help">
                      <span className="text-[10px] font-data-mono text-[var(--theme-text-muted)] block">
                        Tradição Ininterrupta
                      </span>
                      <span className="font-display-hero text-2xl font-bold text-[var(--theme-text-main)] mt-0.5 block">
                        {firmConfig.activeYears}
                      </span>
                      <span className="text-[10px] text-[var(--theme-gold-antique)]">Desde 1997</span>
                    </div>
                  </Tooltip>
                </div>
              </div>

              {/* Chamber Quote */}
              <blockquote className="text-xs font-display-hero italic text-[var(--theme-text-main)]/90 border-l-2 border-[var(--theme-gold)] pl-3 py-1">
                "Não nos curvamos à instabilidade jurisdicional. Construímos a doutrina que orienta a súmula."
              </blockquote>

              <div className="mt-4 pt-3 border-t border-[var(--theme-border)] flex items-center justify-between text-[10px] font-data-mono text-[var(--theme-text-muted)]">
                <span>Gabinete de Crise: Ativo</span>
                <span className="text-[var(--theme-gold)] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 24h Disponível
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

