-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABELA DE CONFIGURAÇÕES DA BANCA (WHITE-LABEL TENANT CONFIG)
CREATE TABLE IF NOT EXISTS public.firm_configs (
  id INT PRIMARY KEY DEFAULT 1,
  firm_name TEXT NOT NULL DEFAULT 'VERITAS & LEX',
  instance_id TEXT NOT NULL DEFAULT 'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
  color_theme_id TEXT NOT NULL DEFAULT 'bordeaux',
  config_json JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- 2. TABELA DE PROTOCOLOS DE AUDIÊNCIA (CONFIDENTIAL INTAKES)
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
  status TEXT NOT NULL DEFAULT 'Pendente', -- 'Pendente', 'Conflito Verificado', 'Audiencia Confirmada'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. TABELA DE NÚCLEOS DE FORÇA (PRACTICE AREAS)
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

-- 4. TABELA DE ARTIGOS E TESES (LAW REVIEW ARTICLES)
CREATE TABLE IF NOT EXISTS public.law_review_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL, -- 'tributario', 'stf', 'arbitragem'
  category_label TEXT NOT NULL,
  read_time TEXT NOT NULL,
  author TEXT NOT NULL,
  abstract TEXT NOT NULL,
  full_content TEXT[] DEFAULT ARRAY[]::TEXT[],
  key_precedents TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. TABELA DE ASSINANTES DO INFORMATIVO (NEWSLETTER SUBSCRIBERS)
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  preference_area TEXT NOT NULL DEFAULT 'Todas as Matérias',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.firm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_review_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Pública
DROP POLICY IF EXISTS "Public read on firm_configs" ON public.firm_configs;
CREATE POLICY "Public read on firm_configs" ON public.firm_configs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read on practice_areas" ON public.practice_areas;
CREATE POLICY "Public read on practice_areas" ON public.practice_areas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read on law_review_articles" ON public.law_review_articles;
CREATE POLICY "Public read on law_review_articles" ON public.law_review_articles FOR SELECT USING (true);

-- Políticas de Submissão Pública (Intake e Newsletter)
DROP POLICY IF EXISTS "Public insert on intake_protocols" ON public.intake_protocols;
CREATE POLICY "Public insert on intake_protocols" ON public.intake_protocols FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert on newsletter_subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Public insert on newsletter_subscribers" ON public.newsletter_subscribers FOR INSERT WITH CHECK (true);

-- Políticas de Escrita para Usuários Autenticados e Anon (Fallback Seguro)
DROP POLICY IF EXISTS "Allow anon upsert on firm_configs" ON public.firm_configs;
CREATE POLICY "Allow anon upsert on firm_configs" ON public.firm_configs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth all on intake_protocols" ON public.intake_protocols;
CREATE POLICY "Auth all on intake_protocols" ON public.intake_protocols FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth all on practice_areas" ON public.practice_areas;
CREATE POLICY "Auth all on practice_areas" ON public.practice_areas FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Auth all on law_review_articles" ON public.law_review_articles;
CREATE POLICY "Auth all on law_review_articles" ON public.law_review_articles FOR ALL USING (true) WITH CHECK (true);