import { FirmConfig, PartnerDossier, PracticeArea, LawReviewArticle, IntakeProtocol } from '../types';

export const initialFirmConfig: FirmConfig = {
  firmName: 'VERITAS & LEX',
  subTitle: 'Advocacia Estratégica & Precedentes',
  instanceId: 'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
  oabRegistry: 'REGISTRO SOCIEDADE OAB/SP Nº 14.892',
  colorThemeId: 'bordeaux',
  sedes: {
    sp: {
      address: 'Av. Brigadeiro Faria Lima, 3477 - 24º Andar',
      neighborhood: 'Itaim Bibi - SP',
      cep: 'CEP 04538-133',
      phone: '+55 (11) 3094-8800',
    },
    df: {
      address: 'Setor Hoteleiro Sul, Quadra 6, Complexo Brasil 21',
      complex: 'Asa Sul - DF',
      cep: 'CEP 70316-000',
      phone: '+55 (61) 3329-9200',
    },
  },
  contactEmail: 'gabinete@veritaslex.adv.br',
  activeLitigationValue: 'R$ 4.280.000.000',
  successRate: '98.4%',
  activeYears: '28 Anos',
};

export const BRAND_ASSETS = {
  logoSeal: 'https://lh3.googleusercontent.com/aida/AEtjO1VRboqgiRMmhr3W9AkRA57BXtox9VGqRM6q9t6rGSnqdAq2zoOoUcbzhxsWsVqSwDntMizU-_QmVFhc5-vuLbuqw9J1l0vmfkH3VFAFesMTR_9ifSlXQF2hIrVX3uREebSd07AyS1zoWB74pCb5dqj8t3Lacndk-p_Z_SOZsqspV0p0yLw5ZxT6R9CZHO_6ngJhKHl634_c3CbNGyu1D258V67LpLnG1P84A5L_RnIIgg',
  heroTribunal: 'https://lh3.googleusercontent.com/aida-public/AB6AXuALQeBR-Kx16_TcMuxW0qHGd6G92xEvPeGKp-rXTrnqs80XwYqIBSR5LNj40mTR_Vzn4iibeWVLWcUt62x-RZ2Rce6hjsV1fSVfJXtczL8_olRfjReIOYeKFWIZv8sSygOvnt9_0CPvR4kCXmnnWhhJ_Ons2QOEUeU8jxRPKCt3CHf52zOu_OBKGOyDH6XbZmjFcAoy7qNoV-R0OVCAf9x1nI3A_iNb0PfAt53Htxfj',
  partnerEduardo: 'https://lh3.googleusercontent.com/aida/AEtjO1X_D3a3ATDaejEiouiHrcWnkmqt8HRMe0Q05zv2Lwb_f93rJYCq4merq5JwlxFFgIe6kwWUzEuM_OI4h4H19TJMZnuXABVi8Ul1yqTr5mkK_Zcz5zPmrQYlypRQx-9GzuledzoZQ1B3AQamMB_D9Xj5U1ND5w6kn-YMolcI_XkOAa8xjcjcmwTAeMFTHb7maorik48Ffy4DMvx0u9wU8aHq5Ss9r9LY-4Hw9-t77qFKIQ',
  partnerHelena: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAeQfK33R3pZI8eSsGOrD_h0zh-vYbxDyZ96w1_0lvOKNtgfpCRqTakKg8IIIIyJO3YwnFbB2lSHRsr_aGVRc-ttb3dcf46tJiNh5LWcxa0xKWE6t1iy4QbE2n4rIowtsqKKFpmu1q4nFavXD9bkgtAkjZSd90sPfWsHG67WqlfsKM8emYC82tjrBNOBxuAIyosHeu79VQjZQQivN_RuGbUkGeFkGEkvqIgFrQJGijI',
};

export const initialPartners: PartnerDossier[] = [
  {
    id: 'eduardo-carvalho',
    name: 'Dr. Eduardo Carvalho',
    role: 'SÓCIO FUNDADOR',
    oab: 'OAB/SP 148.902 • OAB/DF 24.110-A',
    chamber: 'CÂMARA ICC PARIS',
    academicTitle: 'Doutor em Direito Comercial (USP) • Heidelberg Alumnus',
    bio: 'Mais de três décadas dedicadas a arbitragens multibilionárias nos setores de infraestrutura, mineração e fusões hostis. Titular de pareceres que fundamentaram precedentes de repercussão geral perante o Supremo Tribunal Federal.',
    awards: [
      {
        title: 'Chambers Band 1',
        description: 'Dispute Resolution',
      },
      {
        title: 'Árbitro Titular',
        description: 'Lista Oficial CAM-CCBC',
      },
    ],
    lattesId: 'ID-USP-1849',
    imageUrl: BRAND_ASSETS.partnerEduardo,
  },
  {
    id: 'helena-mendes',
    name: 'Dra. Helena Mendes',
    role: 'SÓCIA DIRETORA',
    oab: 'OAB/DF 39.812 • OAB/SP 231.004',
    chamber: 'TRIBUNAIS SUPERIORES',
    academicTitle: 'Mestre em Direito Constitucional (UnB) • Ex-Assessora STF',
    bio: 'Especialista em Ações Diretas de Inconstitucionalidade (ADIs) e Recursos com Repercussão Geral. Conduz intervenções orais nas duas Turmas e no Plenário do Pretório Excelso, atuando na modulação de impactos econômicos sobre grandes grupos industriais.',
    awards: [
      {
        title: 'Leaders League',
        description: 'Appellate Litigation',
      },
      {
        title: '19 Anos Foro',
        description: 'Brasília & Federação',
      },
    ],
    lattesId: 'CNPQ-8830192',
    imageUrl: BRAND_ASSETS.partnerHelena,
  },
];

export const initialPractices: PracticeArea[] = [
  {
    id: 'societario',
    title: 'Direito Societário & Disputas Acionárias',
    category: 'M&A • Governança Restrita',
    description: 'Defesa de acionistas minoritários estratégicos, dissolução não contenciosa, acordos parassociais e proteção de conselheiros de administração contra ações de responsabilidade civil.',
    leadership: 'DR. EDUARDO CARVALHO',
    iconName: 'Building2',
    litigationProfile: 'Contencioso Societário de Alta Repercussão',
  },
  {
    id: 'constitucional',
    title: 'Contencioso Constitucional & Superior',
    category: 'STF • STJ • Cortes Supremas',
    description: 'Elaboração de memoriais customizados, memoriais de embargos de divergência, audiências particulares com ministros relatores e sustentações orais nas Turmas e Plenário.',
    leadership: 'DRA. HELENA MENDES',
    iconName: 'Gavel',
    litigationProfile: 'Precedentes Vinculantes e ADIs',
  },
  {
    id: 'arbitragem',
    title: 'Arbitragem Comercial Internacional',
    category: 'ICC Paris • CAM-CCBC',
    description: 'Resolução de litígios contratuais bilionários em concessões públicas, energia renovável, infraestrutura portuária e pactos transfronteiriços sob regras UNCITRAL e CCI.',
    leadership: 'ARBITRAGEM MULTIJURISDICIONAL',
    iconName: 'Globe',
    litigationProfile: 'Procedimentos Confidenciais Internacionais',
  },
  {
    id: 'tributario',
    title: 'Planejamento Tributário & Wealth Sovereign',
    category: 'CARF • Transações Tributárias',
    description: 'Defesas contra autuações federais exorbitantes, monetização de créditos de IBS/CBS perante a Reforma Constitucional e estruturação de fundos exclusivos fechados para famílias imperiais.',
    leadership: 'CONTENCIOSO FISCAL ESTRATÉGICO',
    iconName: 'Landmark',
    litigationProfile: 'Economia Tributária Estruturada',
  },
  {
    id: 'penal',
    title: 'Direito Penal Econômico & Sanções',
    category: 'White-Collar & Compliance',
    description: 'Atuação profilática em investigações ministeriais, crimes contra a ordem econômica, acordos de leniência perante a CGU e desinterdição célere de patrimônio contingenciado.',
    leadership: 'DEFESA ESPECIALIZADA',
    iconName: 'Shield',
    litigationProfile: 'Blindagem de Executivos e Gestão de Crise',
  },
];

export const initialArticles: LawReviewArticle[] = [
  {
    id: 'art-1',
    title: 'Impacto da Transição IBS/CBS na Aquisição de Sociedades Anônimas em Fase Pré-Operacional',
    category: 'tributario',
    categoryLabel: 'REFORMA TRIBUTÁRIA',
    readTime: '8 MIN LEITURA',
    author: 'DR. MARCOS SIQUEIRA',
    abstract: 'Exame sobre a compensabilidade de créditos tributários e o cálculo do goodwill diante da jurisprudência consolidada do CARF e precedentes do STJ.',
    fullContent: [
      'A introdução do novo modelo tributário sobre o consumo altera de modo indelével a precificação de ativos e a estruturação de aquisições de empresas pré-operacionais no Brasil.',
      'O aproveitamento integral e incondicionado de créditos do IBS e da CBS constitui a pedra de toque para a neutralidade fiscal, porém exige minucioso inventário contábil e diligência prévia quanto aos regimes especiais pretéritos.',
      'Em sede de planejamento de fusões e incorporações, a jurisprudência administrativa do CARF tem exigido prova inequívoca de propósito negocial substancial para validação da amortização de ágio.',
    ],
    keyPrecedents: [
      'Súmula CARF nº 128 - Amortização de ágio com base em rentabilidade futura',
      'REsp 1.879.421/SP - Neutralidade do creditamento na cadeia de suprimentos',
      'Emenda Constitucional nº 132/2023 - Regras de transição do IBS e CBS',
    ],
  },
  {
    id: 'art-2',
    title: 'Limites da Ordem Pública Material e a Homologação de Sentenças Arbitrais no STJ',
    category: 'arbitragem',
    categoryLabel: 'ARBITRAGEM & SOBERANIA',
    readTime: '12 MIN LEITURA',
    author: 'DR. EDUARDO CARVALHO',
    abstract: 'Análise crítica da extensão de cláusulas compromissórias a entes estatais e sociedades de economia mista sem autorização em lei específica.',
    fullContent: [
      'A submissão do Estado e de suas empresas estatais à jurisdição arbitral privada não representa renúncia à soberania, desde que resguardados os direitos indisponíveis da coletividade.',
      'A jurisprudência da Corte Especial do STJ fixou balizas estreitas para a recusa de homologação de laudos arbitrais estrangeiros, limitando a cláusula de ordem pública a violações frontais da Constituição Federal.',
      'A cláusula compromissória por referência em contratos coligados de infraestrutura exige manifestação de vontade congruente, sob pena de nulidade absoluta arguível perante o tribunal arbitral.',
    ],
    keyPrecedents: [
      'SEC 14.930/EX - Homologação de laudo arbitral e soberania estatal',
      'REsp 1.982.341/DF - Extensão subjetiva da cláusula compromissória a partes não signatárias',
      'Convenção de Nova York de 1958 - Artigo V(2)(b)',
    ],
  },
  {
    id: 'art-3',
    title: 'A Relativização da Coisa Julgada e os Efeitos dos Temas 881 e 885 pelo STF',
    category: 'stf',
    categoryLabel: 'PRECEDENTES VINCULANTES',
    readTime: '6 MIN LEITURA',
    author: 'DRA. HELENA MENDES',
    abstract: 'Diretrizes fundamentais para proteção do fluxo de caixa e contingências orçamentárias de empresas que possuíam provimentos transitados em julgado.',
    fullContent: [
      'A cessação imediata da eficácia executiva de decisões transitadas em julgado em relações jurídicas de trato sucessivo, quando contrariadas por tese firmada pelo STF em repercussão geral, redefine o dogma da segurança jurídica.',
      'Faz-se indispensável que os grupos econômicos auditem imediatamente todos os títulos executivos tributários anteriores, recalculando provisões contábeis conforme a modulação temporal decidida no Pretório Excelso.',
      'A interposição de embargos de declaração estratégicos perante as Turmas do STF continua sendo o instrumento técnico vital para demonstrar a boa-fé fiscal e afastar a imposição retroativa de multas punitivas.',
    ],
    keyPrecedents: [
      'Tema 881/STF - Limite temporal da coisa julgada em matéria tributária',
      'Tema 885/STF - Eficácia vinculante de decisões do STF sobre relações continuativas',
      'Súmula 239/STF - Decisão que declara indevida a cobrança do imposto em determinado exercício',
    ],
  },
];

export const initialIntakes: IntakeProtocol[] = [
  {
    id: 'intake-1',
    protocolCode: 'VL-2025-9981',
    clientName: 'Dr. Rodrigo Silveira',
    corporateRole: 'Diretor Jurídico',
    groupName: 'Concessionária Alvorada S.A.',
    email: 'rodrigo@alvorada.com.br',
    court: 'Superior Tribunal de Justiça (STJ)',
    estimatedValue: 'Acima de R$ 50 Milhões',
    briefSummary: 'Recurso Especial com repercussão sobre reequilíbrio econômico-financeiro de contrato de concessão rodoviária.',
    submittedAt: 'Hoje às 11:20',
    status: 'Conflito Verificado',
  },
  {
    id: 'intake-2',
    protocolCode: 'VL-2025-9974',
    clientName: 'Dra. Beatriz Montebello',
    corporateRole: 'Conselheira Geral',
    groupName: 'Montebello Agro Commodities',
    email: 'beatriz@montebello.agr.br',
    court: 'Câmara de Arbitragem ICC Paris',
    estimatedValue: 'Entre R$ 10 Mi e R$ 50 Milhões',
    briefSummary: 'Disputa internacional de embarque de grãos e cláusula de força maior em contrato FOB Santos.',
    submittedAt: 'Ontem às 16:45',
    status: 'Pendente',
  },
];
