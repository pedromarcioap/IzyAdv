import { ColorThemePreset, FirmConfig } from '../types';

export const COLOR_THEME_PRESETS: ColorThemePreset[] = [
  {
    id: 'bordeaux',
    name: 'Bordeaux Imperial & Ouro Nobre',
    badgeLabel: 'Tribunais Superiores & Tradição',
    bgTone: '#0B0305',
    primaryTone: '#581825',
    primaryHover: '#7B1D2E',
    cardTone: '#13060A',
    surfaceTone: '#180A0E',
    borderTone: '#431520',
    goldTone: '#D4AF37',
    goldAntique: '#C5A880',
    gradientButton: 'linear-gradient(to right, #7B1D2E, #5C1320, #3E0C15)',
    textMain: '#FDF9F3',
    textMuted: '#A79388',
  },
  {
    id: 'esmeralda',
    name: 'Esmeralda Soberana & Ouro Antigo',
    badgeLabel: 'Arbitragem Internacional & Wealth',
    bgTone: '#040F0A',
    primaryTone: '#1B4332',
    primaryHover: '#2D6A4F',
    cardTone: '#08140E',
    surfaceTone: '#0E1F17',
    borderTone: '#1A3B2B',
    goldTone: '#E2C044',
    goldAntique: '#99C2A0',
    gradientButton: 'linear-gradient(to right, #2D6A4F, #1B4332, #081C15)',
    textMain: '#FDF9F3',
    textMuted: '#8BAA99',
  },
  {
    id: 'safira',
    name: 'Safira Noturna & Prata Champanhe',
    badgeLabel: 'Societário, M&A & Mercado de Capitais',
    bgTone: '#040A14',
    primaryTone: '#152A4A',
    primaryHover: '#1F3F6D',
    cardTone: '#080F1D',
    surfaceTone: '#0D192E',
    borderTone: '#1A3258',
    goldTone: '#38BDF8',
    goldAntique: '#99B2D8',
    gradientButton: 'linear-gradient(to right, #1F3F6D, #152A4A, #091322)',
    textMain: '#F8FAFC',
    textMuted: '#94A3B8',
  },
  {
    id: 'obsidiana',
    name: 'Obsidiana Monolítica & Âmbar Áureo',
    badgeLabel: 'Litígio Penal Econômico & Crise',
    bgTone: '#08080A',
    primaryTone: '#26262B',
    primaryHover: '#3A3A42',
    cardTone: '#0F0F12',
    surfaceTone: '#16161B',
    borderTone: '#303038',
    goldTone: '#E5B842',
    goldAntique: '#BA9435',
    gradientButton: 'linear-gradient(to right, #3A3A42, #26262B, #141417)',
    textMain: '#F4F4F5',
    textMuted: '#A1A1AA',
  },
  {
    id: 'purpura',
    name: 'Púrpura Magistrado & Bronze Romano',
    badgeLabel: 'Cortes Constitucionais & Pareceres',
    bgTone: '#09030B',
    primaryTone: '#431B4D',
    primaryHover: '#5A2767',
    cardTone: '#130816',
    surfaceTone: '#1C0D21',
    borderTone: '#421B4F',
    goldTone: '#D8A86C',
    goldAntique: '#B5874E',
    gradientButton: 'linear-gradient(to right, #5A2767, #431B4D, #1A0921)',
    textMain: '#FAF5FF',
    textMuted: '#A892B3',
  },
];

export function getActiveTheme(firmConfig: FirmConfig): ColorThemePreset {
  if (firmConfig.colorThemeId === 'custom' && firmConfig.customColors) {
    const custom = firmConfig.customColors;
    return {
      id: 'custom',
      name: 'Paleta Sob Medida',
      badgeLabel: 'Configuração Personalizada',
      bgTone: custom.bgTone || custom.cardTone || '#0B0305',
      primaryTone: custom.primaryTone,
      primaryHover: custom.primaryTone,
      cardTone: custom.cardTone,
      surfaceTone: custom.surfaceTone,
      borderTone: custom.borderTone,
      goldTone: custom.goldTone,
      goldAntique: custom.goldAntique || '#C5A880',
      gradientButton: `linear-gradient(to right, ${custom.primaryTone}, ${custom.cardTone})`,
      textMain: '#FDF9F3',
      textMuted: '#A79388',
    };
  }

  const found = COLOR_THEME_PRESETS.find((t) => t.id === firmConfig.colorThemeId);
  return found || COLOR_THEME_PRESETS[0];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  try {
    const rgb1 = hexToRgb(hex1);
    const rgb2 = hexToRgb(hex2);
    const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
    const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
    const brighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return Math.round(((brighter + 0.05) / (darker + 0.05)) * 100) / 100;
  } catch {
    return 1;
  }
}


