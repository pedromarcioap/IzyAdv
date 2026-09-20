-- ============================================================================
-- IZYADV / VERITAS & LEX - SUPABASE SEED & MIGRATION SCRIPT (DATA INGESTION)
-- Idempotent Data Ingestion Script for PostgreSQL / Supabase
-- Target Schema: public
-- Language: pt-BR
-- ============================================================================

BEGIN;

-- 1. GARANTIR EXTENSÃO UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 2. CRIAÇÃO DAS TABELAS (DDL COMPLEMENTAR / GARANTIA DE ESTRUTURA)
-- ----------------------------------------------------------------------------

-- Configurações Globais / White-Label Tenant Config
CREATE TABLE IF NOT EXISTS public.firm_configs (
  id INT PRIMARY KEY DEFAULT 1,
  firm_name TEXT NOT NULL DEFAULT 'VERITAS & LEX',
  instance_id TEXT NOT NULL DEFAULT 'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
  color_theme_id TEXT NOT NULL DEFAULT 'bordeaux',
  config_json JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- Núcleos de Força (Practice Areas)
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

-- Artigos, Doutrina e Teses Jurídicas (Law Review Articles)
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

-- Protocolos de Audiência Reservada (Intake Protocols)
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

-- Assinantes do Informativo (Newsletter Subscribers)
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  preference_area TEXT NOT NULL DEFAULT 'Todas as Matérias',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Dossiê dos Sócios Seniores e Liderança (Partners / Team Members)
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

-- Indicadores Fatos e Métricas Forenses (Firm Metrics / Stats)
CREATE TABLE IF NOT EXISTS public.firm_metrics (
  id TEXT PRIMARY KEY,
  metric_label TEXT NOT NULL,
  value_display TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'Landmark',
  display_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 3. HABILITAR ROW LEVEL SECURITY (RLS) & POLÍTICAS DE ACESSO
-- ----------------------------------------------------------------------------

ALTER TABLE public.firm_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.law_review_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_metrics ENABLE ROW LEVEL SECURITY;

-- Leitura pública para o portal do cliente
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read on firm_configs') THEN
    CREATE POLICY "Public read on firm_configs" ON public.firm_configs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read on practice_areas') THEN
    CREATE POLICY "Public read on practice_areas" ON public.practice_areas FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read on law_review_articles') THEN
    CREATE POLICY "Public read on law_review_articles" ON public.law_review_articles FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read on partners') THEN
    CREATE POLICY "Public read on partners" ON public.partners FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read on firm_metrics') THEN
    CREATE POLICY "Public read on firm_metrics" ON public.firm_metrics FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public insert on intake_protocols') THEN
    CREATE POLICY "Public insert on intake_protocols" ON public.intake_protocols FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public insert on newsletter_subscribers') THEN
    CREATE POLICY "Public insert on newsletter_subscribers" ON public.newsletter_subscribers FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. INGESTÃO DE DADOS (SEED DATA / POPULAÇÃO IDEMPOTENTE)
-- ----------------------------------------------------------------------------

-- A) CONFIGURAÇÃO GLOBAL DA BANCA (public.firm_configs)
INSERT INTO public.firm_configs (
  id,
  firm_name,
  instance_id,
  color_theme_id,
  config_json,
  updated_at
) VALUES (
  1,
  'VERITAS & LEX',
  'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
  'bordeaux',
  '{
    "firmName": "VERITAS & LEX",
    "subTitle": "Advocacia Estratégica & Precedentes",
    "instanceId": "CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)",
    "oabRegistry": "REGISTRO SOCIEDADE OAB/SP Nº 14.892",
    "colorThemeId": "bordeaux",
    "sedes": {
      "sp": {
        "address": "Av. Brigadeiro Faria Lima, 3477 - 24º Andar",
        "neighborhood": "Itaim Bibi - SP",
        "cep": "CEP 04538-133",
        "phone": "+55 (11) 3094-8800"
      },
      "df": {
        "address": "Setor Hoteleiro Sul, Quadra 6, Complexo Brasil 21",
        "complex": "Asa Sul - DF",
        "cep": "CEP 70316-000",
        "phone": "+55 (61) 3329-9200"
      }
    },
    "contactEmail": "gabinete@veritaslex.adv.br",
    "activeLitigationValue": "R$ 4.280.000.000",
    "successRate": "98.4%",
    "activeYears": "28 Anos"
  }'::jsonb,
  timezone('utc'::text, now())
)
ON CONFLICT (id) DO UPDATE SET
  firm_name = EXCLUDED.firm_name,
  instance_id = EXCLUDED.instance_id,
  color_theme_id = EXCLUDED.color_theme_id,
  config_json = EXCLUDED.config_json,
  updated_at = EXCLUDED.updated_at;


-- B) INDICADORES E MÉTRICAS INSTITUCIONAIS (public.firm_metrics)
INSERT INTO public.firm_metrics (id, metric_label, value_display, description, icon_name, display_order) VALUES
(
  'metric-volume',
  'Volume em Litígio',
  'R$ 4.2 Bi',
  'Valores defendidos em causas tributárias, societárias e desapropriações.',
  'Landmark',
  1
),
(
  'metric-precedents',
  'Precedentes Fixados',
  '114 Teses',
  'Súmulas e teses vencedoras registradas nos anais do STJ e Tribunais Regionais.',
  'Award',
  2
),
(
  'metric-chambers',
  'Câmaras Arbitrais',
  'ICC & CAM',
  'Arbitragens internacionais confidenciais conduzidas em Paris, Genebra e SP.',
  'Network',
  3
),
(
  'metric-success',
  'Acordo Estratégico',
  '87% Taxa',
  'Resoluções prévias e transações tributárias sem exposição mediática.',
  'PieChart',
  4
)
ON CONFLICT (id) DO UPDATE SET
  metric_label = EXCLUDED.metric_label,
  value_display = EXCLUDED.value_display,
  description = EXCLUDED.description,
  icon_name = EXCLUDED.icon_name,
  display_order = EXCLUDED.display_order;


-- C) NÚCLEOS DE FORÇA E ÁREAS DE ATUAÇÃO (public.practice_areas)
INSERT INTO public.practice_areas (
  id,
  title,
  category,
  description,
  leadership,
  icon_name,
  litigation_profile
) VALUES
(
  'societario',
  'Direito Societário & Disputas Acionárias',
  'M&A • Governança Restrita',
  'Defesa de acionistas minoritários estratégicos, dissolução não contenciosa, acordos parassociais e proteção de conselheiros de administração contra ações de responsabilidade civil.',
  'DR. EDUARDO CARVALHO',
  'Building2',
  'Contencioso Societário de Alta Repercussão'
),
(
  'constitucional',
  'Contencioso Constitucional & Superior',
  'STF • STJ • Cortes Supremas',
  'Elaboração de memoriais customizados, memoriais de embargos de divergência, audiências particulares com ministros relatores e sustentações orais nas Turmas e Plenário.',
  'DRA. HELENA MENDES',
  'Gavel',
  'Precedentes Vinculantes e ADIs'
),
(
  'arbitragem',
  'Arbitragem Comercial Internacional',
  'ICC Paris • CAM-CCBC',
  'Resolução de litígios contratuais bilionários em concessões públicas, energia renovável, infraestrutura portuária e pactos transfronteiriços sob regras UNCITRAL e CCI.',
  'ARBITRAGEM MULTIJURISDICIONAL',
  'Globe',
  'Procedimentos Confidenciais Internacionais'
),
(
  'tributario',
  'Planejamento Tributário & Wealth Sovereign',
  'CARF • Transações Tributárias',
  'Defesas contra autuações federais exorbitantes, monetização de créditos de IBS/CBS perante a Reforma Constitucional e estruturação de fundos exclusivos fechados para famílias imperiais.',
  'CONTENCIOSO FISCAL ESTRATÉGICO',
  'Landmark',
  'Economia Tributária Estruturada'
),
(
  'penal',
  'Direito Penal Econômico & Sanções',
  'White-Collar & Compliance',
  'Atuação profilática em investigações ministeriais, crimes contra a ordem econômica, acordos de leniência perante a CGU e desinterdição célere de patrimônio contingenciado.',
  'DEFESA ESPECIALIZADA',
  'Shield',
  'Blindagem de Executivos e Gestão de Crise'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  leadership = EXCLUDED.leadership,
  icon_name = EXCLUDED.icon_name,
  litigation_profile = EXCLUDED.litigation_profile;


-- D) DOSSIÊ DOS SÓCIOS SENIORES (public.partners)
INSERT INTO public.partners (
  id,
  name,
  role,
  oab,
  chamber,
  academic_title,
  bio,
  awards,
  lattes_id,
  image_url
) VALUES
(
  'eduardo-carvalho',
  'Dr. Eduardo Carvalho',
  'SÓCIO FUNDADOR',
  'OAB/SP 148.902 • OAB/DF 24.110-A',
  'CÂMARA ICC PARIS',
  'Doutor em Direito Comercial (USP) • Heidelberg Alumnus',
  'Mais de três décadas dedicadas a arbitragens multibilionárias nos setores de infraestrutura, mineração e fusões hostis. Titular de pareceres que fundamentaram precedentes de repercussão geral perante o Supremo Tribunal Federal.',
  '[
    {"title": "Chambers Band 1", "description": "Dispute Resolution"},
    {"title": "Árbitro Titular", "description": "Lista Oficial CAM-CCBC"}
  ]'::jsonb,
  'ID-USP-1849',
  'https://lh3.googleusercontent.com/aida/AEtjO1X_D3a3ATDaejEiouiHrcWnkmqt8HRMe0Q05zv2Lwb_f93rJYCq4merq5JwlxFFgIe6kwWUzEuM_OI4h4H19TJMZnuXABVi8Ul1yqTr5mkK_Zcz5zPmrQYlypRQx-9GzuledzoZQ1B3AQamMB_D9Xj5U1ND5w6kn-YMolcI_XkOAa8xjcjcmwTAeMFTHb7maorik48Ffy4DMvx0u9wU8aHq5Ss9r9LY-4Hw9-t77qFKIQ'
),
(
  'helena-mendes',
  'Dra. Helena Mendes',
  'SÓCIA DIRETORA',
  'OAB/DF 39.812 • OAB/SP 231.004',
  'TRIBUNAIS SUPERIORES',
  'Mestre em Direito Constitucional (UnB) • Ex-Assessora STF',
  'Especialista em Ações Diretas de Inconstitucionalidade (ADIs) e Recursos com Repercussão Geral. Conduz intervenções orais nas duas Turmas e no Plenário do Pretório Excelso, atuando na modulação de impactos econômicos sobre grandes grupos industriais.',
  '[
    {"title": "Leaders League", "description": "Appellate Litigation"},
    {"title": "19 Anos Foro", "description": "Brasília & Federação"}
  ]'::jsonb,
  'CNPQ-8830192',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAeQfK33R3pZI8eSsGOrD_h0zh-vYbxDyZ96w1_0lvOKNtgfpCRqTakKg8IIIIyJO3YwnFbB2lSHRsr_aGVRc-ttb3dcf46tJiNh5LWcxa0xKWE6t1iy4QbE2n4rIowtsqKKFpmu1q4nFavXD9bkgtAkjZSd90sPfWsHG67WqlfsKM8emYC82tjrBNOBxuAIyosHeu79VQjZQQivN_RuGbUkGeFkGEkvqIgFrQJGijI'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  oab = EXCLUDED.oab,
  chamber = EXCLUDED.chamber,
  academic_title = EXCLUDED.academic_title,
  bio = EXCLUDED.bio,
  awards = EXCLUDED.awards,
  lattes_id = EXCLUDED.lattes_id,
  image_url = EXCLUDED.image_url;


-- E) PUBLICAÇÕES, ARTIGOS E TESES JURÍDICAS (public.law_review_articles)
INSERT INTO public.law_review_articles (
  id,
  title,
  category,
  category_label,
  read_time,
  author,
  abstract,
  full_content,
  key_precedents
) VALUES
(
  'art-1',
  'Impacto da Transição IBS/CBS na Aquisição de Sociedades Anônimas em Fase Pré-Operacional',
  'tributario',
  'REFORMA TRIBUTÁRIA',
  '8 MIN LEITURA',
  'DR. MARCOS SIQUEIRA',
  'Exame sobre a compensabilidade de créditos tributários e o cálculo do goodwill diante da jurisprudência consolidada do CARF e precedentes do STJ.',
  ARRAY[
    'A introdução do novo modelo tributário sobre o consumo altera de modo indelével a precificação de ativos e a estruturação de aquisições de empresas pré-operacionais no Brasil.',
    'O aproveitamento integral e incondicionado de créditos do IBS e da CBS constitui a pedra de toque para a neutralidade fiscal, porém exige minucioso inventário contábil e diligência prévia quanto aos regimes especiais pretéritos.',
    'Em sede de planejamento de fusões e incorporações, a jurisprudência administrativa do CARF tem exigido prova inequívoca de propósito negocial substancial para validação da amortização de ágio.'
  ],
  ARRAY[
    'Súmula CARF nº 128 - Amortização de ágio com base em rentabilidade futura',
    'REsp 1.879.421/SP - Neutralidade do creditamento na cadeia de suprimentos',
    'Emenda Constitucional nº 132/2023 - Regras de transição do IBS e CBS'
  ]
),
(
  'art-2',
  'Limites da Ordem Pública Material e a Homologação de Sentenças Arbitrais no STJ',
  'arbitragem',
  'ARBITRAGEM & SOBERANIA',
  '12 MIN LEITURA',
  'DR. EDUARDO CARVALHO',
  'Análise crítica da extensão de cláusulas compromissórias a entes estatais e sociedades de economia mista sem autorização em lei específica.',
  ARRAY[
    'A submissão do Estado e de suas empresas estatais à jurisdição arbitral privada não representa renúncia à soberania, desde que resguardados os direitos indisponíveis da coletividade.',
    'A jurisprudência da Corte Especial do STJ fixou balizas estreitas para a recusa de homologação de laudos arbitrais estrangeiros, limitando a cláusula de ordem pública a violações frontais da Constituição Federal.',
    'A cláusula compromissória por referência em contratos coligados de infraestrutura exige manifestação de vontade congruente, sob pena de nulidade absoluta arguível perante o tribunal arbitral.'
  ],
  ARRAY[
    'SEC 14.930/EX - Homologação de laudo arbitral e soberania estatal',
    'REsp 1.982.341/DF - Extensão subjetiva da cláusula compromissória a partes não signatárias',
    'Convenção de Nova York de 1958 - Artigo V(2)(b)'
  ]
),
(
  'art-3',
  'A Relativização da Coisa Julgada e os Efeitos dos Temas 881 e 885 pelo STF',
  'stf',
  'PRECEDENTES VINCULANTES',
  '6 MIN LEITURA',
  'DRA. HELENA MENDES',
  'Diretrizes fundamentais para proteção do fluxo de caixa e contingências orçamentárias de empresas que possuíam provimentos transitados em julgado.',
  ARRAY[
    'A cessação imediata da eficácia executiva de decisões transitadas em julgado em relações jurídicas de trato sucessivo, quando contrariadas por tese firmada pelo STF em repercussão geral, redefine o dogma da segurança jurídica.',
    'Faz-se indispensável que os grupos econômicos auditem imediatamente todos os títulos executivos tributários anteriores, recalculando provisões contábeis conforme a modulação temporal decidida no Pretório Excelso.',
    'A interposição de embargos de declaração estratégicos perante as Turmas do STF continua sendo o instrumento técnico vital para demonstrar a boa-fé fiscal e afastar a imposição retroativa de multas punitivas.'
  ],
  ARRAY[
    'Tema 881/STF - Limite temporal da coisa julgada em matéria tributária',
    'Tema 885/STF - Eficácia vinculante de decisões do STF sobre relações continuativas',
    'Súmula 239/STF - Decisão que declara indevida a cobrança do imposto em determinado exercício'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  read_time = EXCLUDED.read_time,
  author = EXCLUDED.author,
  abstract = EXCLUDED.abstract,
  full_content = EXCLUDED.full_content,
  key_precedents = EXCLUDED.key_precedents;


-- F) PROTOCOLOS DE AUDIÊNCIA RESERVADA (public.intake_protocols)
INSERT INTO public.intake_protocols (
  id,
  protocol_code,
  client_name,
  corporate_role,
  group_name,
  email,
  court,
  estimated_value,
  brief_summary,
  status
) VALUES
(
  'intake-1',
  'VL-2025-9981',
  'Dr. Rodrigo Silveira',
  'Diretor Jurídico',
  'Concessionária Alvorada S.A.',
  'rodrigo@alvorada.com.br',
  'Superior Tribunal de Justiça (STJ)',
  'Acima de R$ 50 Milhões',
  'Recurso Especial com repercussão sobre reequilíbrio econômico-financeiro de contrato de concessão rodoviária.',
  'Conflito Verificado'
),
(
  'intake-2',
  'VL-2025-9974',
  'Dra. Beatriz Montebello',
  'Conselheira Geral',
  'Montebello Agro Commodities',
  'beatriz@montebello.agr.br',
  'Câmara de Arbitragem ICC Paris',
  'Entre R$ 10 Mi e R$ 50 Milhões',
  'Disputa internacional de embarque de grãos e cláusula de força maior em contrato FOB Santos.',
  'Pendente'
)
ON CONFLICT (id) DO UPDATE SET
  protocol_code = EXCLUDED.protocol_code,
  client_name = EXCLUDED.client_name,
  corporate_role = EXCLUDED.corporate_role,
  group_name = EXCLUDED.group_name,
  email = EXCLUDED.email,
  court = EXCLUDED.court,
  estimated_value = EXCLUDED.estimated_value,
  brief_summary = EXCLUDED.brief_summary,
  status = EXCLUDED.status;


-- G) ASSINANTES DO INFORMATIVO DO GABINETE (public.newsletter_subscribers)
INSERT INTO public.newsletter_subscribers (
  id,
  email,
  preference_area,
  created_at
) VALUES
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
  'conselho@holdingalvorada.com.br',
  'Direito Tributário & Reforma',
  timezone('utc'::text, now())
),
(
  'b1febc99-8c0b-4ef8-aa6d-7bb9bd380a22'::uuid,
  'gestao@montebelloagro.com.br',
  'Arbitragem Internacional',
  timezone('utc'::text, now())
)
ON CONFLICT (email) DO UPDATE SET
  preference_area = EXCLUDED.preference_area;

COMMIT;

-- ============================================================================
-- 5. VERIFICAÇÃO DE INTEGRIDADE (SANITY CHECK QUERIES)
-- Executar para confirmar a contagem de registros populados
-- ============================================================================

SELECT 'firm_configs' AS tabela, COUNT(*) AS total_registros FROM public.firm_configs
UNION ALL
SELECT 'firm_metrics', COUNT(*) FROM public.firm_metrics
UNION ALL
SELECT 'practice_areas', COUNT(*) FROM public.practice_areas
UNION ALL
SELECT 'partners', COUNT(*) FROM public.partners
UNION ALL
SELECT 'law_review_articles', COUNT(*) FROM public.law_review_articles
UNION ALL
SELECT 'intake_protocols', COUNT(*) FROM public.intake_protocols
UNION ALL
SELECT 'newsletter_subscribers', COUNT(*) FROM public.newsletter_subscribers;
