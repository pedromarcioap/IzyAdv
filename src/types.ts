export interface ColorThemePreset {
  id: 'bordeaux' | 'esmeralda' | 'safira' | 'obsidiana' | 'purpura' | 'custom';
  name: string;
  badgeLabel: string;
  bgTone: string;
  primaryTone: string;
  primaryHover: string;
  cardTone: string;
  surfaceTone: string;
  borderTone: string;
  goldTone: string;
  goldAntique: string;
  gradientButton: string;
  textMain: string;
  textMuted: string;
}

export interface FirmConfig {
  firmName: string;
  subTitle: string;
  instanceId: string;
  oabRegistry: string;
  colorThemeId: 'bordeaux' | 'esmeralda' | 'safira' | 'obsidiana' | 'purpura' | 'custom';
  customColors?: {
    bgTone?: string;
    primaryTone: string;
    cardTone: string;
    surfaceTone: string;
    borderTone: string;
    goldTone: string;
    goldAntique?: string;
  };
  sedes: {
    sp: {
      address: string;
      neighborhood: string;
      cep: string;
      phone: string;
    };
    df: {
      address: string;
      complex: string;
      cep: string;
      phone: string;
    };
  };
  contactEmail: string;
  activeLitigationValue: string;
  successRate: string;
  activeYears: string;
}

export interface AdminUser {
  id: string;
  name?: string;
  email: string;
  role: 'Master Admin' | 'Sócio Titular' | 'Advogado Associado';
  lastSignIn?: string;
  createdAt?: string;
  password?: string;
}


export interface PartnerDossier {
  id: string;
  name: string;
  role: string;
  oab: string;
  chamber: string;
  academicTitle: string;
  bio: string;
  awards: {
    title: string;
    description: string;
  }[];
  lattesId: string;
  imageUrl: string;
}

export interface PracticeArea {
  id: string;
  title: string;
  category: string;
  description: string;
  leadership: string;
  iconName: string;
  litigationProfile: string;
}

export interface LawReviewArticle {
  id: string;
  title: string;
  category: 'tributario' | 'stf' | 'arbitragem';
  categoryLabel: string;
  readTime: string;
  author: string;
  abstract: string;
  fullContent: string[];
  keyPrecedents: string[];
}

export interface IntakeProtocol {
  id: string;
  protocolCode: string;
  clientName: string;
  corporateRole: string;
  groupName: string;
  email: string;
  court: string;
  estimatedValue: string;
  briefSummary: string;
  submittedAt: string;
  status: 'Pendente' | 'Conflito Verificado' | 'Audiencia Confirmada';
}

export interface FeeCalculationParams {
  instance: 'stf' | 'arbitragem' | 'tributario';
  economicValue: 'alto' | 'medio' | 'base';
  urgency: boolean;
}
