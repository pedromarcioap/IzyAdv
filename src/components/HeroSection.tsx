import React from 'react';
import { Landmark, Shield, ChevronDown, Lock, Scale } from 'lucide-react';
import { FirmConfig } from '../types';
import { BRAND_ASSETS } from '../data/initialData';

interface HeroSectionProps {
  firmConfig: FirmConfig;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ firmConfig }) => {
  return (
    <section
      id="tribunal"
      className="relative min-h-[92vh] flex items-center justify-center overflow-hidden border-b border-[#431520]"
    >
      {/* Full Bleed Architectural Photography Hero Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={BRAND_ASSETS.heroTribunal}
          alt="Tribunal Monumental"
          className="w-full h-full object-cover object-center filter brightness-[0.42] contrast-[1.18] scale-[1.02] transform transition-transform duration-1000"
        />
        {/* Multi-layer brutalist gradient washes */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0305] via-[#0B0305]/70 to-transparent"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0305]/90 via-transparent to-[#0B0305]/90"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08)_0%,transparent_70%)]"></div>
      </div>

      <div className="relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 py-20 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Text Content: Grandeur & Authority */}
          <div className="lg:col-span-8 flex flex-col items-start">
            <div className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded bg-[#2E0F17]/80 border border-[#C5A880]/30 backdrop-blur-md mb-6">
              <Landmark className="w-4 h-4 text-[#D4AF37]" />
              <span className="font-data-mono text-[11px] uppercase tracking-widest text-[#E8D8CE]">
                Soberania Forense & Defesa Corporativa Implacável
              </span>
            </div>

            <h1 className="font-display-hero text-4xl sm:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight text-[#FDF9F3] mb-6">
              A Fortaleza Dogmática dos <br />
              <span className="italic font-normal bg-gradient-to-r from-[#D4AF37] via-[#E6CA85] to-[#C5A880] bg-clip-text text-transparent drop-shadow-sm">
                Tribunais Superiores
              </span>{' '}
              & Ativos Soberanos.
            </h1>

            <p className="text-[#E8D8CE] text-lg sm:text-xl font-light leading-relaxed max-w-3xl mb-10 text-justify">
              Doutrina austera, blindagem patrimonial sem precedentes e intervenções decisivas perante o{' '}
              <strong className="text-[#FDF9F3] font-medium">STF, STJ</strong> e Câmaras Internacionais de Arbitragem ({' '}
              <strong className="text-[#FDF9F3] font-medium">ICC Paris & CAM-CCBC</strong>).
            </p>

            {/* Dual Luxury CTAs */}
            <div className="flex flex-wrap items-center gap-5 w-full sm:w-auto">
              <a
                href="#audiencia"
                className="px-8 py-4 rounded bg-gradient-to-r from-[#6A1624] via-[#480E18] to-[#2B080F] border border-[#D4AF37]/60 text-[#FDF9F3] font-medium text-sm tracking-widest uppercase flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(212,175,55,0.25)] hover:shadow-[0_0_40px_rgba(212,175,55,0.45)] hover:border-[#D4AF37] transition-all duration-300"
              >
                <Shield className="w-5 h-5 text-[#D4AF37]" />
                <span>Solicitar Audiência Reservada</span>
              </a>
              <a
                href="#socios-dossier"
                className="px-8 py-4 rounded bg-[#13060A]/80 hover:bg-[#2E0F17]/80 border border-[#431520] text-[#E8D8CE] hover:text-[#D4AF37] font-data-mono text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all backdrop-blur-md"
              >
                <span>Examinar Banca de Sócios</span>
                <ChevronDown className="w-4 h-4" />
              </a>
            </div>

            {/* Oath and Seal Strip */}
            <div className="mt-12 pt-6 border-t border-[#431520]/70 flex flex-wrap items-center gap-y-3 gap-x-8 font-data-mono text-[11px] text-[#A79388] uppercase tracking-wider">
              <span className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-[#C5A880]" />
                Sigilo Absoluto • Provimento OAB 205/2021
              </span>
              <span className="text-[#431520] hidden md:inline">|</span>
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#C5A880]" />
                Prevenção Anti-Conflito Automatizada
              </span>
              <span className="text-[#431520] hidden md:inline">|</span>
              <span className="flex items-center gap-2">
                <Scale className="w-3.5 h-3.5 text-[#C5A880]" />
                Sustentação Oral Privada nos Tribunais
              </span>
            </div>
          </div>

          {/* Hero Floating Monolith Card */}
          <div className="lg:col-span-4 relative">
            <div className="relative bg-gradient-to-b from-[#2E0F17]/90 to-[#180A0E]/95 border border-[#C5A880]/30 rounded-xl p-6 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-[#431520]/80">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]"></span>
                  <span className="font-data-mono text-xs font-semibold text-[#FDF9F3] uppercase tracking-widest">
                    Painel Soberano
                  </span>
                </div>
                <span className="text-[10px] font-data-mono text-[#C5A880] bg-[#C5A880]/10 px-2 py-0.5 rounded">
                  WL-LIVE
                </span>
              </div>

              {/* Live Chamber Metric */}
              <div className="py-6 flex flex-col gap-5">
                <div className="bg-[#0B0305]/60 p-4 rounded-lg border border-[#431520]">
                  <span className="text-[10px] font-data-mono uppercase tracking-widest text-[#A79388] block mb-1">
                    Litígios Ativos Conduzidos
                  </span>
                  <div className="font-display-hero text-4xl text-[#D4AF37] font-bold">
                    {firmConfig.activeLitigationValue}
                  </div>
                  <span className="text-xs text-[#E8D8CE]/80 mt-1 block">
                    Proteção e repatriação patrimonial em arbitragem e contencioso.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#0B0305]/60 p-3.5 rounded border border-[#431520]">
                    <span className="text-[10px] font-data-mono text-[#A79388] block">
                      Êxito STF / STJ
                    </span>
                    <span className="font-display-hero text-2xl font-bold text-[#FDF9F3] mt-0.5 block">
                      {firmConfig.successRate}
                    </span>
                    <span className="text-[10px] text-[#C5A880]">
                      Admissibilidade Plena
                    </span>
                  </div>
                  <div className="bg-[#0B0305]/60 p-3.5 rounded border border-[#431520]">
                    <span className="text-[10px] font-data-mono text-[#A79388] block">
                      Tradição Ininterrupta
                    </span>
                    <span className="font-display-hero text-2xl font-bold text-[#FDF9F3] mt-0.5 block">
                      {firmConfig.activeYears}
                    </span>
                    <span className="text-[10px] text-[#C5A880]">Desde 1997</span>
                  </div>
                </div>
              </div>

              {/* Chamber Quote */}
              <blockquote className="text-xs font-display-hero italic text-[#E8D8CE]/90 border-l-2 border-[#D4AF37] pl-3 py-1">
                "Não nos curvamos à instabilidade jurisdicional. Construímos a doutrina que orienta a súmula."
              </blockquote>

              <div className="mt-4 pt-3 border-t border-[#431520] flex items-center justify-between text-[10px] font-data-mono text-[#A79388]">
                <span>Gabinete de Crise: Ativo</span>
                <span className="text-[#D4AF37] flex items-center gap-1">
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
