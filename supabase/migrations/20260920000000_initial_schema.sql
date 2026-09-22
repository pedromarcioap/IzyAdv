-- ============================================================================
-- INITIAL CORE BASE SCHEMA
-- Base tables for white-label legal portal: firm_configs, practice_areas,
-- law_review_articles, intake_protocols, partners, firm_metrics,
-- and base newsletter_subscribers.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Configurações Globais / White-Label Tenant Config
CREATE TABLE IF NOT EXISTS public.firm_configs (
  id INT PRIMARY KEY DEFAULT 1,
  firm_name TEXT NOT NULL DEFAULT 'VERITAS & LEX',
  instance_id TEXT NOT NULL DEFAULT 'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
  color_theme_id TEXT NOT NULL DEFAULT 'bordeaux',
  config_json JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- 2. Protocolos de Audiência Reservada (Intake Protocols)
CREATE TABLE IF NOT EXISTS public.intake_protocols (
  id TEXT PRIMARY KEY,
  protocol_code TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  corporate_role TEXT NOT NULL,
  group_name TEXT NOT NULL,
  email TEXT NOT NULL,
  court TEXT NOT NULL,
  estimated_value TEXT NOT NULL,
  brief_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Núcleos de Força (Practice Areas)
CREATE TABLE IF NOT EXISTS public.practice_areas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  leadership TEXT NOT NULL,
  icon_name TEXT DEFAULT 'Building2',
  litigation_profile TEXT DEFAULT 'Contencioso Estratégico',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Artigos, Doutrina e Teses Jurídicas (Law Review Articles)
CREATE TABLE IF NOT EXISTS public.law_review_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  category_label TEXT NOT NULL,
  read_time TEXT NOT NULL,
  author TEXT NOT NULL,
  abstract TEXT NOT NULL,
  full_content TEXT[] DEFAULT ARRAY[]::TEXT[],
  key_precedents TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Assinantes do Informativo (Newsletter Subscribers Base)
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  preference_area TEXT NOT NULL DEFAULT 'Todas as Matérias',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Dossiê dos Sócios Seniores (Partners)
CREATE TABLE IF NOT EXISTS public.partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  oab TEXT NOT NULL,
  chamber TEXT NOT NULL,
  academic_title TEXT NOT NULL,
  bio TEXT NOT NULL,
  awards JSONB NOT NULL DEFAULT '[]'::jsonb,
  lattes_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Indicadores e Métricas (Firm Metrics)
CREATE TABLE IF NOT EXISTS public.firm_metrics (
  id TEXT PRIMARY KEY,
  metric_label TEXT NOT NULL,
  value_display TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'Landmark',
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Row Level Security Enablement
ALTER TABLE public.firm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_review_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_metrics ENABLE ROW LEVEL SECURITY;
