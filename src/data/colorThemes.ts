import { ColorThemePreset, FirmConfig } from '../types';

export const COLOR_THEME_PRESETS: ColorThemePreset[] = [
  {
    id: 'bordeaux',
    name: 'Bordeaux Imperial & Ouro Nobre',
    badgeLabel: 'Tribunais Superiores & Tradição',
    primaryTone: '#581825',
    cardTone: '#13060A',
    surfaceTone: '#180A0E',
    borderTone: '#431520',
    goldTone: '#D4AF37',
    goldAntique: '#C5A880',
    gradientButton: 'linear-gradient(to right, #7B1D2E, #5C1320, #3E0C15)',
  },
  {
    id: 'esmeralda',
    name: 'Esmeralda Soberana & Ouro Antigo',
    badgeLabel: 'Arbitragem Internacional & Wealth',
    primaryTone: '#1B4332',
    cardTone: '#08140E',
    surfaceTone: '#0E1F17',
    borderTone: '#1A3B2B',
    goldTone: '#D4AF37',
    goldAntique: '#C5A880',
    gradientButton: 'linear-gradient(to right, #2D6A4F, #1B4332, #081C15)',
  },
  {
    id: 'safira',
    name: 'Safira Noturna & Prata Champanhe',
    badgeLabel: 'Societário, M&A & Mercado de Capitais',
    primaryTone: '#152A4A',
    cardTone: '#080F1D',
    surfaceTone: '#0D192E',
    borderTone: '#1A3258',
    goldTone: '#D4AF37',
    goldAntique: '#99B2D8',
    gradientButton: 'linear-gradient(to right, #1F3F6D, #152A4A, #091322)',
  },
  {
    id: 'obsidiana',
    name: 'Obsidiana Monolítica & Âmbar Áureo',
    badgeLabel: 'Litígio Penal Econômico & Crise',
    primaryTone: '#26262B',
    cardTone: '#0F0F12',
    surfaceTone: '#16161B',
    borderTone: '#303038',
    goldTone: '#E5B842',
    goldAntique: '#BA9435',
    gradientButton: 'linear-gradient(to right, #3A3A42, #26262B, #141417)',
  },
  {
    id: 'purpura',
    name: 'Púrpura Magistrado & Bronze Romano',
    badgeLabel: 'Cortes Constitucionais & Pareceres',
    primaryTone: '#431B4D',
    cardTone: '#130816',
    surfaceTone: '#1C0D21',
    borderTone: '#421B4F',
    goldTone: '#D8A86C',
    goldAntique: '#B5874E',
    gradientButton: 'linear-gradient(to right, #5A2767, #431B4D, #1A0921)',
  },
];

export function getActiveTheme(firmConfig: FirmConfig): ColorThemePreset {
  if (firmConfig.colorThemeId === 'custom' && firmConfig.customColors) {
    return {
      id: 'custom',
      name: 'Paleta Sob Medida',
      badgeLabel: 'Configuração Personalizada',
      primaryTone: firmConfig.customColors.primaryTone,
      cardTone: firmConfig.customColors.cardTone,
      surfaceTone: firmConfig.customColors.surfaceTone,
      borderTone: firmConfig.customColors.borderTone,
      goldTone: firmConfig.customColors.goldTone,
      goldAntique: '#C5A880',
      gradientButton: `linear-gradient(to right, ${firmConfig.customColors.primaryTone}, ${firmConfig.customColors.cardTone})`,
    };
  }

  const found = COLOR_THEME_PRESETS.find((t) => t.id === firmConfig.colorThemeId);
  return found || COLOR_THEME_PRESETS[0];
}
