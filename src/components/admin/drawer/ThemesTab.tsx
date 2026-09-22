import React from 'react';
import { Palette, Check, Sliders } from 'lucide-react';
import { FirmConfig } from '../../../types';
import { COLOR_THEME_PRESETS, getContrastRatio } from '../../../data/colorThemes';

const getWcagTextBadgeClass = (textRatio: number) => {
  if (textRatio >= 7) return 'bg-emerald-950 text-emerald-300 border border-emerald-800';
  if (textRatio >= 4.5) return 'bg-blue-950 text-blue-300 border border-blue-800';
  return 'bg-rose-950 text-rose-300 border border-rose-800';
};

const getWcagGoldBadgeClass = (goldRatio: number) => {
  if (goldRatio >= 4.5) return 'bg-emerald-950 text-emerald-300 border border-emerald-800';
  if (goldRatio >= 3) return 'bg-amber-950 text-amber-300 border border-amber-800';
  return 'bg-rose-950 text-rose-300 border border-rose-800';
};

const getWcagTextBadgeLabel = (ratio: number) => {
  if (ratio >= 7) return 'WCAG AAA';
  if (ratio >= 4.5) return 'WCAG AA';
  return 'Baixo Contraste';
};

const getWcagGoldBadgeLabel = (ratio: number) => {
  if (ratio >= 4.5) return 'WCAG AA';
  if (ratio >= 3) return 'Grande Porte AA';
  return 'Alerta Contraste';
};

export interface CustomColorsState {
  primaryTone: string;
  cardTone: string;
  surfaceTone: string;
  borderTone: string;
  goldTone: string;
}

interface ThemesTabProps {
  editedConfig: FirmConfig;
  customColors: CustomColorsState;
  setCustomColors: React.Dispatch<React.SetStateAction<CustomColorsState>>;
  handleSelectThemePreset: (themeId: 'bordeaux' | 'esmeralda' | 'safira' | 'obsidiana' | 'purpura' | 'custom') => void;
  handleApplyCustomColors: () => void;
}

export const ThemesTab: React.FC<ThemesTabProps> = ({
  editedConfig,
  customColors,
  setCustomColors,
  handleSelectThemePreset,
  handleApplyCustomColors,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Palette className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
              Identidade Visual & Paleta Cromática
            </span>
          </div>
          <p className="text-xs text-[#A79388]">
            Altere instantaneamente a atmosfera estética do portal do gabinete com paletas institucionais ou personalizadas.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block">
          Paletas Nobres Pré-Configuradas (Presets Institucionais)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {COLOR_THEME_PRESETS.map((preset) => {
            const isSelected = editedConfig.colorThemeId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectThemePreset(preset.id)}
                className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[#D4AF37] bg-[#240A11] shadow-[0_0_15px_rgba(212,175,55,0.15)]'
                    : 'border-[#431520] bg-[#0B0305] hover:border-[#431520]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display-hero text-sm font-bold text-[#FDF9F3]">
                    {preset.name}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-[#D4AF37]" />}
                </div>
                <p className="text-[11px] text-[#A79388] mb-3 leading-relaxed">
                  {preset.badgeLabel}
                </p>

                <div className="flex items-center gap-1.5 p-1.5 rounded bg-[#180A0E] border border-[#431520]">
                  <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.primaryTone }} title="Tom Primário" />
                  <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.cardTone }} title="Tom de Card" />
                  <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.surfaceTone }} title="Superfície" />
                  <div className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: preset.borderTone }} title="Bordas" />
                  <div className="w-4 h-4 rounded-full border border-white/20 ml-auto" style={{ backgroundColor: preset.goldTone }} title="Acento Dourado" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-data-mono text-[#D4AF37]">
            <Sliders className="w-4 h-4" />
            <span>PALETA CUSTOMIZADA (STUDIO HEX)</span>
          </div>
          <button
            type="button"
            onClick={handleApplyCustomColors}
            className="px-3 py-1 rounded bg-[#D4AF37] text-[#0B0305] text-xs font-bold font-data-mono uppercase tracking-wider hover:brightness-110 cursor-pointer"
          >
            Aplicar Customizado
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label htmlFor="primary-tone-picker" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Primário
            </label>
            <div className="flex items-center gap-2 p-1.5 rounded bg-[#0B0305] border border-[#431520]">
              <input
                id="primary-tone-picker"
                type="color"
                value={customColors.primaryTone}
                onChange={(e) => setCustomColors({ ...customColors, primaryTone: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                type="text"
                aria-label="Primário Valor Hexadecimal"
                value={customColors.primaryTone}
                onChange={(e) => setCustomColors({ ...customColors, primaryTone: e.target.value })}
                className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none font-data-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="card-tone-picker" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Cards
            </label>
            <div className="flex items-center gap-2 p-1.5 rounded bg-[#0B0305] border border-[#431520]">
              <input
                id="card-tone-picker"
                type="color"
                value={customColors.cardTone}
                onChange={(e) => setCustomColors({ ...customColors, cardTone: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                type="text"
                aria-label="Cards Valor Hexadecimal"
                value={customColors.cardTone}
                onChange={(e) => setCustomColors({ ...customColors, cardTone: e.target.value })}
                className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none font-data-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="surface-tone-picker" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Superfície
            </label>
            <div className="flex items-center gap-2 p-1.5 rounded bg-[#0B0305] border border-[#431520]">
              <input
                id="surface-tone-picker"
                type="color"
                value={customColors.surfaceTone}
                onChange={(e) => setCustomColors({ ...customColors, surfaceTone: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                type="text"
                aria-label="Superfície Valor Hexadecimal"
                value={customColors.surfaceTone}
                onChange={(e) => setCustomColors({ ...customColors, surfaceTone: e.target.value })}
                className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none font-data-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="border-tone-picker" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Bordas
            </label>
            <div className="flex items-center gap-2 p-1.5 rounded bg-[#0B0305] border border-[#431520]">
              <input
                id="border-tone-picker"
                type="color"
                value={customColors.borderTone}
                onChange={(e) => setCustomColors({ ...customColors, borderTone: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                type="text"
                aria-label="Bordas Valor Hexadecimal"
                value={customColors.borderTone}
                onChange={(e) => setCustomColors({ ...customColors, borderTone: e.target.value })}
                className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none font-data-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="gold-tone-picker" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Dourado / Acento
            </label>
            <div className="flex items-center gap-2 p-1.5 rounded bg-[#0B0305] border border-[#431520]">
              <input
                id="gold-tone-picker"
                type="color"
                value={customColors.goldTone}
                onChange={(e) => setCustomColors({ ...customColors, goldTone: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                type="text"
                aria-label="Dourado / Acento Valor Hexadecimal"
                value={customColors.goldTone}
                onChange={(e) => setCustomColors({ ...customColors, goldTone: e.target.value })}
                className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none font-data-mono"
              />
            </div>
          </div>
        </div>

        {/* WCAG Accessibility & Contrast Feedback */}
        {(() => {
          const textRatio = getContrastRatio('#FDF9F3', customColors.cardTone);
          const goldRatio = getContrastRatio(customColors.goldTone, customColors.cardTone);
          const textBadgeLabel = getWcagTextBadgeLabel(textRatio);
          const goldBadgeLabel = getWcagGoldBadgeLabel(goldRatio);
          return (
            <div className="pt-3 border-t border-[#431520] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-data-mono">
              <div className="p-2.5 rounded bg-[#0B0305] border border-[#431520] flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[#A79388] uppercase">Contraste Texto Principal</div>
                  <div className="text-sm font-bold text-[#FDF9F3]">{textRatio}:1</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getWcagTextBadgeClass(textRatio)}`}>
                  {textBadgeLabel}
                </span>
              </div>

              <div className="p-2.5 rounded bg-[#0B0305] border border-[#431520] flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[#A79388] uppercase">Contraste Dourado / Fundo</div>
                  <div className="text-sm font-bold" style={{ color: customColors.goldTone }}>{goldRatio}:1</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getWcagGoldBadgeClass(goldRatio)}`}>
                  {goldBadgeLabel}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};
