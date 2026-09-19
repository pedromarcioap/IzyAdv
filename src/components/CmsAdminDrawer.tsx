import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Building2,
  FileCheck2,
  Plus,
  Trash2,
  CheckCircle,
  RefreshCw,
  BookOpen,
  Palette,
  Database,
  LogOut,
  ShieldCheck,
  Check,
  FileCode,
  Copy,
  Users,
  UserPlus,
  ShieldAlert,
  KeyRound,
  Mail,
  AlertCircle,
} from 'lucide-react';
import { FirmConfig, IntakeProtocol, PracticeArea, LawReviewArticle, AdminUser } from '../types';
import { COLOR_THEME_PRESETS, getActiveTheme } from '../data/colorThemes';
import {
  isSupabaseConfigured,
  dbFetchAdminUsers,
  dbCreateAdminUser,
  dbDeleteAdminUser,
  getMissingTables,
  resetMissingTables,
  SUPABASE_SCHEMA_SQL,
} from '../lib/supabase';

interface CmsAdminDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  firmConfig: FirmConfig;
  onUpdateFirmConfig: (newConfig: FirmConfig) => void;
  intakes: IntakeProtocol[];
  onUpdateIntakes: (newIntakes: IntakeProtocol[]) => void;
  practices: PracticeArea[];
  onAddPractice: (practice: PracticeArea) => void;
  articles: LawReviewArticle[];
  onAddArticle: (article: LawReviewArticle) => void;
  currentUser: AdminUser | null;
  onLogout: () => void;
}

export const CmsAdminDrawer: React.FC<CmsAdminDrawerProps> = ({
  isOpen,
  onClose,
  firmConfig,
  onUpdateFirmConfig,
  intakes,
  onUpdateIntakes,
  practices,
  onAddPractice,
  articles,
  onAddArticle,
  currentUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'branding' | 'themes' | 'users' | 'intakes' | 'content' | 'database'>('themes');
  const [showSqlSchema, setShowSqlSchema] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [missingTablesList, setMissingTablesList] = useState<string[]>(() => getMissingTables());
  const [revalidating, setRevalidating] = useState(false);

  const isAdmin = currentUser?.role === 'Master Admin' || currentUser?.role === 'Sócio Titular';

  // User management state
  const [userList, setUserList] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Advogado Associado' as 'Master Admin' | 'Sócio Titular' | 'Advogado Associado',
  });

  useEffect(() => {
    if (isOpen) {
      dbFetchAdminUsers().then((res) => setUserList(res));
      setMissingTablesList(getMissingTables());
    }
  }, [isOpen, activeTab]);

  // Local state for editing firm
  const [editedConfig, setEditedConfig] = useState<FirmConfig>(firmConfig);

  // Local state for custom color pickers
  const [customColors, setCustomColors] = useState({
    primaryTone: firmConfig.customColors?.primaryTone || '#581825',
    cardTone: firmConfig.customColors?.cardTone || '#13060A',
    surfaceTone: firmConfig.customColors?.surfaceTone || '#180A0E',
    borderTone: firmConfig.customColors?.borderTone || '#431520',
    goldTone: firmConfig.customColors?.goldTone || '#D4AF37',
  });

  // Local state for adding practice
  const [newPractice, setNewPractice] = useState({
    title: '',
    category: '',
    description: '',
    leadership: '',
  });

  // Local state for adding article
  const [newArticle, setNewArticle] = useState({
    title: '',
    category: 'tributario' as 'tributario' | 'stf' | 'arbitragem',
    categoryLabel: 'TRIBUTÁRIO',
    readTime: '7 MIN LEITURA',
    author: '',
    abstract: '',
  });

  if (!isOpen) return null;

  const currentTheme = getActiveTheme(firmConfig);

  const handleSelectThemePreset = (themeId: 'bordeaux' | 'esmeralda' | 'safira' | 'obsidiana' | 'purpura' | 'custom') => {
    const updated = {
      ...editedConfig,
      colorThemeId: themeId,
      customColors: themeId === 'custom' ? customColors : undefined,
    };
    setEditedConfig(updated);
    onUpdateFirmConfig(updated);
  };

  const handleApplyCustomColors = () => {
    const updated = {
      ...editedConfig,
      colorThemeId: 'custom' as const,
      customColors: customColors,
    };
    setEditedConfig(updated);
    onUpdateFirmConfig(updated);
  };

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateFirmConfig(editedConfig);
  };

  const applyPreset = (preset: 'standard' | 'arbitrage' | 'agro') => {
    if (preset === 'standard') {
      const cfg: FirmConfig = {
        ...editedConfig,
        firmName: 'VERITAS & LEX',
        subTitle: 'Advocacia Estratégica & Precedentes',
        instanceId: 'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
        oabRegistry: 'REGISTRO SOCIEDADE OAB/SP Nº 14.892',
        colorThemeId: 'bordeaux',
        activeLitigationValue: 'R$ 4.280.000.000',
        successRate: '98.4%',
        activeYears: '28 Anos',
      };
      setEditedConfig(cfg);
      onUpdateFirmConfig(cfg);
    } else if (preset === 'arbitrage') {
      const cfg: FirmConfig = {
        ...editedConfig,
        firmName: 'CARVALHO, MENDES & ASSOCIADOS',
        subTitle: 'Arbitragem Internacional & Contencioso Superior',
        instanceId: 'ICC-CAM MULTIJURISDICTIONAL FIRM (WL-SVR-772)',
        oabRegistry: 'REGISTRO SOCIEDADE OAB/SP Nº 22.140',
        colorThemeId: 'esmeralda',
        activeLitigationValue: 'R$ 6.150.000.000',
        successRate: '99.1%',
        activeYears: '31 Anos',
      };
      setEditedConfig(cfg);
      onUpdateFirmConfig(cfg);
    } else {
      const cfg: FirmConfig = {
        ...editedConfig,
        firmName: 'BARBOSA, PRADO & SILVEIRA',
        subTitle: 'Direito Tributário, Wealth Planning & Agro Sovereign',
        instanceId: 'AGRO & WEALTH SPECIALIZED ALLIANCE (WL-SVR-405)',
        oabRegistry: 'REGISTRO SOCIEDADE OAB/DF Nº 08.411',
        colorThemeId: 'safira',
        activeLitigationValue: 'R$ 2.890.000.000',
        successRate: '96.8%',
        activeYears: '22 Anos',
      };
      setEditedConfig(cfg);
      onUpdateFirmConfig(cfg);
    }
  };

  const handleStatusChange = (
    id: string,
    newStatus: 'Pendente' | 'Conflito Verificado' | 'Audiencia Confirmada'
  ) => {
    const updated = intakes.map((item) =>
      item.id === id ? { ...item, status: newStatus } : item
    );
    onUpdateIntakes(updated);
  };

  const handleDeleteIntake = (id: string) => {
    onUpdateIntakes(intakes.filter((item) => item.id !== id));
  };

  const handleCreatePractice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPractice.title) return;
    const practice: PracticeArea = {
      id: `practice-${Date.now()}`,
      title: newPractice.title,
      category: newPractice.category || 'NOVA PRÁTICA JURISDICIONAL',
      description: newPractice.description || 'Defesa especializada e consultoria estratégica.',
      leadership: newPractice.leadership || 'SÓCIO TITULAR',
      iconName: 'Building2',
      litigationProfile: 'Contencioso Estratégico Corporativo',
    };
    onAddPractice(practice);
    setNewPractice({ title: '', category: '', description: '', leadership: '' });
  };

  const handleCreateArticle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArticle.title) return;
    const article: LawReviewArticle = {
      id: `article-${Date.now()}`,
      title: newArticle.title,
      category: newArticle.category,
      categoryLabel: newArticle.category.toUpperCase(),
      readTime: newArticle.readTime,
      author: newArticle.author || 'CORPO JURÍDICO',
      abstract: newArticle.abstract || 'Estudo aprofundado sobre doutrina e jurisprudência aplicável.',
      fullContent: [
        newArticle.abstract || 'Estudo aprofundado sobre doutrina e jurisprudência aplicável.',
        'A evolução da jurisprudência perante as Cortes Superiores impõe constante revisão das teses defensivas e das estruturas contratuais.',
      ],
      keyPrecedents: ['Precedente Jurisprudencial Vinculante - STJ/STF'],
    };
    onAddArticle(article);
    setNewArticle({
      title: '',
      category: 'tributario',
      categoryLabel: 'TRIBUTÁRIO',
      readTime: '7 MIN LEITURA',
      author: '',
      abstract: '',
    });
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setUserError('Apenas usuários com perfil Administrador possuem autorização para criar novas contas.');
      return;
    }
    if (!newUserForm.name.trim() || !newUserForm.email.trim()) {
      setUserError('Informe o nome completo e o e-mail institucional do sócio.');
      return;
    }
    if (!newUserForm.password || newUserForm.password.length < 6) {
      setUserError('A senha inicial deve conter pelo menos 6 caracteres.');
      return;
    }

    setUserLoading(true);
    setUserError(null);
    setUserSuccess(null);

    const res = await dbCreateAdminUser({
      name: newUserForm.name,
      email: newUserForm.email,
      password: newUserForm.password,
      role: newUserForm.role,
    });

    setUserLoading(false);

    if (res.error) {
      setUserError(res.error);
    } else if (res.user) {
      setUserSuccess(`Usuário ${res.user.name || res.user.email} cadastrado com sucesso como ${res.user.role}!`);
      setNewUserForm({
        name: '',
        email: '',
        password: '',
        role: 'Advogado Associado',
      });
      const updated = await dbFetchAdminUsers();
      setUserList(updated);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!isAdmin) return;
    if (currentUser && currentUser.email.toLowerCase() === userEmail.toLowerCase()) {
      setUserError('Não é permitido revogar o próprio usuário atualmente em sessão.');
      return;
    }
    await dbDeleteAdminUser(userId);
    const updated = await dbFetchAdminUsers();
    setUserList(updated);
    setUserSuccess(`Acesso do usuário ${userEmail} revogado com sucesso.`);
  };

  const handleGeneratePassword = () => {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    setNewUserForm((prev) => ({
      ...prev,
      password: `Veritas#${randomDigits}!`,
    }));
  };

  const copySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleRevalidateTables = async () => {
    setRevalidating(true);
    resetMissingTables();
    await onUpdateFirmConfig(editedConfig);
    setTimeout(() => {
      setMissingTablesList(getMissingTables());
      setRevalidating(false);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex justify-end">
      <div className="bg-[#13060A] border-l border-[#D4AF37]/40 w-full max-w-2xl h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Top Bar with Current User & Supabase status */}
        <div className="p-6 border-b border-[#431520] bg-[#180A0E] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-[#240A11] border border-[#D4AF37]/30 text-[#D4AF37]">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-data-mono text-[#D4AF37] uppercase tracking-wider block">
                  White-Label Legal CMS
                </span>
                <span className="text-[9px] font-data-mono bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                  {currentUser ? currentUser.role : 'Sessão Autenticada'}
                </span>
              </div>
              <h2 className="font-display-hero text-xl font-bold text-[#FDF9F3]">
                Painel Administrativo Soberano
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <button
                type="button"
                onClick={onLogout}
                title="Desconectar do Supabase"
                className="p-1.5 rounded border border-[#431520] bg-[#0B0305] text-[#A79388] hover:text-[#D4AF37] text-xs flex items-center gap-1 font-data-mono cursor-pointer transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="text-[#A79388] hover:text-[#FDF9F3] p-1 cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#431520] bg-[#0B0305] text-xs font-data-mono overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`py-3 px-3.5 flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'themes'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E] font-semibold'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Paletas & Cores</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`py-3 px-3.5 flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'branding'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E] font-semibold'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Identidade</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`py-3 px-3.5 flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E] font-semibold'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Usuários & Acessos</span>
            {isAdmin ? (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 font-bold">
                ADMIN
              </span>
            ) : (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#431520] text-[#A79388]">
                REST
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('intakes')}
            className={`py-3 px-3.5 flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer relative ${
              activeTab === 'intakes'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E] font-semibold'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Protocolos ({intakes.length})</span>
            {intakes.filter((i) => i.status === 'Pendente').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`py-3 px-3.5 flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'content'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E] font-semibold'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Práticas & Teses</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`py-3 px-3.5 flex items-center justify-center gap-1.5 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'database'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E] font-semibold'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Supabase DB</span>
            {isSupabaseConfigured && missingTablesList.length > 0 && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                title="Migração DDL pendente no Supabase"
              />
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB: THEMES & COLOR VARIATIONS */}
          {activeTab === 'themes' && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-4 h-4" />
                    Variações Cromáticas da Banca (White-Label Theming)
                  </span>
                  <span className="text-[10px] font-data-mono text-[#C5A880] bg-[#C5A880]/10 px-2 py-0.5 rounded">
                    Ativo: {currentTheme.name}
                  </span>
                </div>
                <p className="text-xs text-[#A79388] leading-relaxed mb-4">
                  Selecione uma das paletas institucionais calibradas para diferentes áreas de atuação do Direito, ou personalize as cores hexadecimais da sua banca.
                </p>

                {/* Theme Preset Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {COLOR_THEME_PRESETS.map((theme) => {
                    const isSelected = firmConfig.colorThemeId === theme.id;
                    return (
                      <div
                        key={theme.id}
                        onClick={() => handleSelectThemePreset(theme.id)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                          isSelected
                            ? 'border-[#D4AF37] bg-[#180A0E] shadow-[0_0_20px_rgba(212,175,55,0.15)]'
                            : 'border-[#431520] bg-[#0B0305] hover:border-[#C5A880]/50'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-display-hero font-bold text-[#FDF9F3]">
                              {theme.name}
                            </span>
                            {isSelected && (
                              <span className="w-4 h-4 rounded-full bg-[#D4AF37] flex items-center justify-center text-[#0B0305]">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-data-mono text-[#A79388] block mb-3">
                            {theme.badgeLabel}
                          </span>

                          {/* Swatches */}
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className="w-6 h-6 rounded border border-white/20 shadow-sm"
                              style={{ backgroundColor: theme.primaryTone }}
                              title="Tom Primário"
                            />
                            <span
                              className="w-6 h-6 rounded border border-white/20 shadow-sm"
                              style={{ backgroundColor: theme.cardTone }}
                              title="Superfície / Fundo"
                            />
                            <span
                              className="w-6 h-6 rounded border border-white/20 shadow-sm"
                              style={{ backgroundColor: theme.borderTone }}
                              title="Borda Institucional"
                            />
                            <span
                              className="w-6 h-6 rounded border border-white/20 shadow-sm"
                              style={{ backgroundColor: theme.goldTone }}
                              title="Dourado Nobre"
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#431520] flex items-center justify-between text-[10px] font-data-mono text-[#C5A880]">
                          <span>{isSelected ? 'PALETA APLICADA' : 'CLIQUE PARA ATIVAR'}</span>
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: theme.goldTone }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom Colors Editor */}
              <div className="bg-[#180A0E] p-5 rounded-xl border border-[#431520] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider">
                    Personalização Hexadecimal Avançada
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyCustomColors}
                    className="px-3 py-1 rounded bg-[#D4AF37] text-[#0B0305] text-xs font-data-mono font-bold uppercase hover:brightness-110 cursor-pointer"
                  >
                    Aplicar Paleta Custom
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-data-mono">
                  <div>
                    <label className="block text-[10px] text-[#A79388] uppercase mb-1">
                      Tom Primário
                    </label>
                    <div className="flex items-center gap-2 bg-[#0B0305] p-1.5 rounded border border-[#431520]">
                      <input
                        type="color"
                        value={customColors.primaryTone}
                        onChange={(e) =>
                          setCustomColors({ ...customColors, primaryTone: e.target.value })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={customColors.primaryTone}
                        onChange={(e) =>
                          setCustomColors({ ...customColors, primaryTone: e.target.value })
                        }
                        className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#A79388] uppercase mb-1">
                      Fundo / Cards
                    </label>
                    <div className="flex items-center gap-2 bg-[#0B0305] p-1.5 rounded border border-[#431520]">
                      <input
                        type="color"
                        value={customColors.cardTone}
                        onChange={(e) =>
                          setCustomColors({ ...customColors, cardTone: e.target.value })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={customColors.cardTone}
                        onChange={(e) =>
                          setCustomColors({ ...customColors, cardTone: e.target.value })
                        }
                        className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#A79388] uppercase mb-1">
                      Dourado / Acento
                    </label>
                    <div className="flex items-center gap-2 bg-[#0B0305] p-1.5 rounded border border-[#431520]">
                      <input
                        type="color"
                        value={customColors.goldTone}
                        onChange={(e) =>
                          setCustomColors({ ...customColors, goldTone: e.target.value })
                        }
                        className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={customColors.goldTone}
                        onChange={(e) =>
                          setCustomColors({ ...customColors, goldTone: e.target.value })
                        }
                        className="w-full bg-transparent text-[#FDF9F3] text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: BRANDING & TENANT CONFIG */}
          {activeTab === 'branding' && (
            <div className="space-y-6">
              {/* User Management Quick Banner */}
              <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-[#D4AF37]" />
                    <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
                      Configurações de Usuários & Credenciamento
                    </span>
                    {isAdmin && (
                      <span className="text-[9px] font-data-mono bg-emerald-950 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-800">
                        ADMIN ATIVO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#A79388]">
                    A criação de novos sócios e advogados é restrita aos administradores do gabinete.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className="px-3.5 py-2 rounded bg-[#240A11] border border-[#D4AF37]/50 hover:bg-[#D4AF37] hover:text-[#0B0305] text-[#D4AF37] text-xs font-data-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Gerenciar Usuários</span>
                </button>
              </div>

              {/* Presets */}
              <div className="bg-[#180A0E] p-4 rounded-lg border border-[#431520]">
                <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block mb-2">
                  Instâncias Prontas de Simulação (White-Label Presets)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset('standard')}
                    className="p-2.5 rounded bg-[#0B0305] border border-[#431520] hover:border-[#D4AF37] text-left text-xs font-data-mono cursor-pointer"
                  >
                    <div className="text-[#FDF9F3] font-bold">Veritas & Lex</div>
                    <div className="text-[10px] text-[#A79388]">Tribunais Superiores</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('arbitrage')}
                    className="p-2.5 rounded bg-[#0B0305] border border-[#431520] hover:border-[#D4AF37] text-left text-xs font-data-mono cursor-pointer"
                  >
                    <div className="text-[#FDF9F3] font-bold">Carvalho & Mendes</div>
                    <div className="text-[10px] text-[#A79388]">Arbitragem Internacional</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('agro')}
                    className="p-2.5 rounded bg-[#0B0305] border border-[#431520] hover:border-[#D4AF37] text-left text-xs font-data-mono cursor-pointer"
                  >
                    <div className="text-[#FDF9F3] font-bold">Barbosa & Prado</div>
                    <div className="text-[10px] text-[#A79388]">Tributário & Wealth</div>
                  </button>
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveBranding} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                      Razão da Sociedade (Nome)
                    </label>
                    <input
                      type="text"
                      value={editedConfig.firmName}
                      onChange={(e) =>
                        setEditedConfig({ ...editedConfig, firmName: e.target.value })
                      }
                      className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                      Subtítulo Editorial
                    </label>
                    <input
                      type="text"
                      value={editedConfig.subTitle}
                      onChange={(e) =>
                        setEditedConfig({ ...editedConfig, subTitle: e.target.value })
                      }
                      className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                    Instância e Código do Servidor
                  </label>
                  <input
                    type="text"
                    value={editedConfig.instanceId}
                    onChange={(e) =>
                      setEditedConfig({ ...editedConfig, instanceId: e.target.value })
                    }
                    className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                      Registro OAB
                    </label>
                    <input
                      type="text"
                      value={editedConfig.oabRegistry}
                      onChange={(e) =>
                        setEditedConfig({ ...editedConfig, oabRegistry: e.target.value })
                      }
                      className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                      Litígio Ativo
                    </label>
                    <input
                      type="text"
                      value={editedConfig.activeLitigationValue}
                      onChange={(e) =>
                        setEditedConfig({
                          ...editedConfig,
                          activeLitigationValue: e.target.value,
                        })
                      }
                      className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                      Taxa de Êxito
                    </label>
                    <input
                      type="text"
                      value={editedConfig.successRate}
                      onChange={(e) =>
                        setEditedConfig({ ...editedConfig, successRate: e.target.value })
                      }
                      className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] font-bold text-xs font-data-mono uppercase tracking-wider hover:brightness-110 flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Publicar Alterações no Portal</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB: USERS & ACCESS MANAGEMENT (ADMIN-ONLY CREATION) */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-[#D4AF37]" />
                    <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
                      Configurações de Usuários & Controle de Acesso (RBAC)
                    </span>
                  </div>
                  <p className="text-xs text-[#A79388]">
                    Gestão centralizada de credenciais societárias e permissões de acesso ao gabinete digital.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-data-mono px-2 py-1 rounded bg-[#0B0305] border border-[#431520] text-[#E8D8CE]">
                    Sessão: <strong className="text-[#FDF9F3]">{currentUser?.email || 'Admin'}</strong>
                  </span>
                  <span
                    className={`text-[10px] font-data-mono px-2 py-1 rounded font-bold ${
                      isAdmin
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950/80 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {isAdmin ? 'Privilégio Administrador' : 'Acesso Consulta'}
                  </span>
                </div>
              </div>

              {/* Security Gate Check */}
              {!isAdmin ? (
                <div className="bg-[#180A0E] border border-red-900/60 rounded-xl p-6 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-red-950/80 border border-red-800 flex items-center justify-center mx-auto text-red-400">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-display-hero text-lg font-bold text-[#FDF9F3]">
                      Criação de Usuários Restrita a Administradores
                    </h3>
                    <p className="text-xs text-[#A79388] max-w-md mx-auto leading-relaxed">
                      A criação de novas contas e a concessão de acessos é uma prerrogativa restrita a usuários com perfil <strong className="text-[#D4AF37]">Master Admin</strong> ou <strong className="text-[#D4AF37]">Sócio Titular</strong>.
                    </p>
                  </div>

                  <div className="p-3 bg-[#0B0305] border border-[#431520] rounded-lg max-w-md mx-auto text-left text-xs font-data-mono text-[#A79388] space-y-1.5">
                    <div className="flex items-center justify-between text-[#FDF9F3]">
                      <span>Seu perfil conectado:</span>
                      <span className="text-[#C5A880] font-bold">{currentUser?.role || 'Advogado Associado'}</span>
                    </div>
                    <p className="text-[11px] text-[#A79388] leading-normal pt-1 border-t border-[#431520]/50">
                      Para solicitar o cadastramento de um novo sócio ou associado, entre em contato com o Sócio Diretor / Master Admin da banca.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Creation Form (Admin Only) */}
                  <div className="bg-[#180A0E] p-5 rounded-xl border border-[#431520] space-y-4">
                    <div className="flex items-center justify-between border-b border-[#431520] pb-3">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
                          Credenciar Novo Usuário / Sócio (Exclusivo Admin)
                        </span>
                      </div>
                      <span className="text-[10px] font-data-mono text-[#A79388] bg-[#0B0305] px-2 py-0.5 rounded border border-[#431520]">
                        RBAC Provisioning
                      </span>
                    </div>

                    {userSuccess && (
                      <div className="p-3 rounded bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs font-data-mono flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>{userSuccess}</span>
                      </div>
                    )}

                    {userError && (
                      <div className="p-3 rounded bg-red-950/70 border border-red-800 text-red-200 text-xs font-data-mono flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>{userError}</span>
                      </div>
                    )}

                    <form onSubmit={handleCreateUser} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                            Nome Completo do Sócio / Usuário *
                          </label>
                          <input
                            type="text"
                            required
                            value={newUserForm.name}
                            onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                            placeholder="Dr. Carlos Eduardo Fagundes"
                            className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                            E-mail Institucional *
                          </label>
                          <input
                            type="email"
                            required
                            value={newUserForm.email}
                            onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                            placeholder="carlos.fagundes@veritaslex.adv.br"
                            className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none font-data-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-data-mono uppercase text-[#A79388]">
                              Senha Provisória de Acesso *
                            </label>
                            <button
                              type="button"
                              onClick={handleGeneratePassword}
                              className="text-[10px] font-data-mono text-[#D4AF37] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <KeyRound className="w-2.5 h-2.5" />
                              <span>Gerar Senha Forte</span>
                            </button>
                          </div>
                          <input
                            type="text"
                            required
                            value={newUserForm.password}
                            onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                            placeholder="Veritas@2025!"
                            className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none font-data-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
                            Perfil de Acesso / Nível RBAC *
                          </label>
                          <select
                            value={newUserForm.role}
                            onChange={(e) =>
                              setNewUserForm({
                                ...newUserForm,
                                role: e.target.value as 'Master Admin' | 'Sócio Titular' | 'Advogado Associado',
                              })
                            }
                            className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none font-data-mono"
                          >
                            <option value="Advogado Associado">Advogado Associado (Forense & Consulta)</option>
                            <option value="Sócio Titular">Sócio Titular (Gestão de Casos & Criação de Usuários)</option>
                            <option value="Master Admin">Master Admin (Controle Total & Infraestrutura)</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="submit"
                          disabled={userLoading}
                          className="py-2.5 px-6 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] font-bold text-xs font-data-mono uppercase tracking-wider hover:brightness-110 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>{userLoading ? 'Provisionando...' : 'Criar e Credenciar Usuário'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </>
              )}

              {/* Users List (Auditable List) */}
              <div className="bg-[#180A0E] p-5 rounded-xl border border-[#431520] space-y-4">
                <div className="flex items-center justify-between border-b border-[#431520] pb-3">
                  <div>
                    <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold block">
                      Corpo Societário & Usuários Cadastrados
                    </span>
                    <span className="text-[11px] text-[#A79388]">
                      {userList.length} contas habilitadas no gabinete
                    </span>
                  </div>
                  <span className="text-[10px] font-data-mono text-[#C5A880] bg-[#0B0305] px-2.5 py-1 rounded border border-[#431520]">
                    Segurança OAB & LGPD
                  </span>
                </div>

                <div className="space-y-2.5">
                  {userList.map((user) => {
                    const isCurrentUser = currentUser?.email.toLowerCase() === user.email.toLowerCase();
                    return (
                      <div
                        key={user.id}
                        className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isCurrentUser
                            ? 'border-[#D4AF37]/50 bg-[#240A11]/60 shadow-[0_0_10px_rgba(212,175,55,0.08)]'
                            : 'border-[#431520] bg-[#0B0305] hover:border-[#431520]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#180A0E] border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37] font-bold text-xs shrink-0 font-data-mono">
                            {user.name ? user.name.slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-display-hero text-sm font-bold text-[#FDF9F3]">
                                {user.name || 'Sócio / Advogado'}
                              </span>
                              {isCurrentUser && (
                                <span className="text-[9px] font-data-mono bg-[#D4AF37] text-[#0B0305] font-bold px-1.5 py-0.2 rounded">
                                  VOCÊ
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-data-mono text-[#A79388]">
                              <Mail className="w-3 h-3 text-[#C5A880]" />
                              <span>{user.email}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#431520]">
                          <div className="text-right">
                            <span
                              className={`inline-block text-[10px] font-data-mono uppercase tracking-wider px-2 py-0.5 rounded border font-semibold ${
                                user.role === 'Master Admin'
                                  ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/40'
                                  : user.role === 'Sócio Titular'
                                  ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                                  : 'bg-[#180A0E] text-[#C5A880] border-[#431520]'
                              }`}
                            >
                              {user.role}
                            </span>
                            <div className="text-[9px] font-data-mono text-[#7D6B60] mt-0.5">
                              {user.lastSignIn ? `Último: ${user.lastSignIn}` : 'Nunca acessou'}
                            </div>
                          </div>

                          {isAdmin && (
                            <button
                              type="button"
                              disabled={isCurrentUser}
                              onClick={() => handleDeleteUser(user.id, user.email)}
                              title={isCurrentUser ? 'Não é possível revogar o próprio usuário ativo' : 'Revogar acesso deste usuário'}
                              className={`p-2 rounded border text-xs cursor-pointer transition-colors ${
                                isCurrentUser
                                  ? 'border-transparent text-[#431520] opacity-30 cursor-not-allowed'
                                  : 'border-[#431520] text-[#A79388] hover:text-red-400 hover:border-red-900/60 bg-[#180A0E]'
                              }`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'intakes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#431520]">
                <span className="text-xs font-data-mono text-[#D4AF37] uppercase">
                  Fila de Solicitações Confidenciais ({intakes.length})
                </span>
                <span className="text-[11px] font-data-mono text-[#A79388]">
                  Criptografia Ativa
                </span>
              </div>

              {intakes.length === 0 ? (
                <div className="text-center py-12 text-[#A79388] text-xs font-data-mono">
                  Nenhum protocolo recebido no momento.
                </div>
              ) : (
                intakes.map((intake) => (
                  <div
                    key={intake.id}
                    className="bg-[#180A0E] p-4 rounded-lg border border-[#431520] space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-data-mono text-[#D4AF37] font-bold bg-[#D4AF37]/10 px-2 py-0.5 rounded border border-[#D4AF37]/20">
                        #{intake.protocolCode}
                      </span>
                      <span
                        className={`text-[10px] font-data-mono px-2 py-0.5 rounded ${
                          intake.status === 'Audiencia Confirmada'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : intake.status === 'Conflito Verificado'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-[#2E0F17] text-[#E8D8CE] border border-[#431520]'
                        }`}
                      >
                        {intake.status}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-display-hero font-bold text-[#FDF9F3]">
                        {intake.clientName} - {intake.corporateRole}
                      </h4>
                      <p className="text-xs text-[#C5A880]">{intake.groupName} ({intake.email})</p>
                    </div>

                    <div className="bg-[#0B0305] p-3 rounded text-xs space-y-1 font-data-mono border border-[#431520]">
                      <div className="flex justify-between text-[#A79388]">
                        <span>Tribunal:</span>
                        <span className="text-[#FDF9F3]">{intake.court}</span>
                      </div>
                      <div className="flex justify-between text-[#A79388]">
                        <span>Proveito:</span>
                        <span className="text-[#D4AF37]">{intake.estimatedValue}</span>
                      </div>
                      <div className="text-[#E8D8CE] pt-1 text-[11px] font-normal italic">
                        "{intake.briefSummary}"
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-[10px] font-data-mono text-[#A79388]">
                        {intake.submittedAt}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(intake.id, 'Conflito Verificado')}
                          className="px-2.5 py-1 rounded bg-[#240A11] hover:bg-[#2E0F17] text-[11px] font-data-mono text-[#E8D8CE] border border-[#431520] cursor-pointer"
                        >
                          Conflito OK
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(intake.id, 'Audiencia Confirmada')}
                          className="px-2.5 py-1 rounded bg-emerald-900/60 hover:bg-emerald-800/60 text-[11px] font-data-mono text-emerald-200 border border-emerald-700 cursor-pointer flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" />
                          <span>Agendar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteIntake(intake.id)}
                          className="p-1 text-[#A79388] hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: PRACTICES & THESES */}
          {activeTab === 'content' && (
            <div className="space-y-6">
              {/* Add Practice */}
              <div className="bg-[#180A0E] p-4 rounded-lg border border-[#431520] space-y-3">
                <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block">
                  Cadastrar Novo Núcleo de Força (Prática)
                </span>
                <form onSubmit={handleCreatePractice} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Título da Prática (ex.: Direito Marítimo)"
                      required
                      value={newPractice.title}
                      onChange={(e) => setNewPractice({ ...newPractice, title: e.target.value })}
                      className="bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Categoria (ex.: Porto de Santos & Cabotagem)"
                      value={newPractice.category}
                      onChange={(e) => setNewPractice({ ...newPractice, category: e.target.value })}
                      className="bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Descrição da atuação estratégica e complexidade..."
                    value={newPractice.description}
                    onChange={(e) =>
                      setNewPractice({ ...newPractice, description: e.target.value })
                    }
                    className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none resize-none"
                  />
                  <div className="flex justify-between items-center">
                    <input
                      type="text"
                      placeholder="Sócio Responsável (ex.: DR. EDUARDO CARVALHO)"
                      value={newPractice.leadership}
                      onChange={(e) =>
                        setNewPractice({ ...newPractice, leadership: e.target.value })
                      }
                      className="bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none w-64"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 rounded bg-[#D4AF37] text-[#0B0305] font-bold text-xs font-data-mono uppercase tracking-wider hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Inserir Prática</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Add Law Review Article */}
              <div className="bg-[#180A0E] p-4 rounded-lg border border-[#431520] space-y-3">
                <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block">
                  Publicar Nova Tese no Law Review
                </span>
                <form onSubmit={handleCreateArticle} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Título da Tese Doutrinária"
                    required
                    value={newArticle.title}
                    onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
                    className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={newArticle.category}
                      onChange={(e) =>
                        setNewArticle({
                          ...newArticle,
                          category: e.target.value as 'tributario' | 'stf' | 'arbitragem',
                        })
                      }
                      className="bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none cursor-pointer"
                    >
                      <option value="tributario">Tributário / CARF</option>
                      <option value="stf">STF / STJ</option>
                      <option value="arbitragem">Arbitragem Internacional</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Autor (ex.: DRA. HELENA MENDES)"
                      value={newArticle.author}
                      onChange={(e) => setNewArticle({ ...newArticle, author: e.target.value })}
                      className="bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none"
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Síntese dogmática e abstract do artigo..."
                    value={newArticle.abstract}
                    onChange={(e) => setNewArticle({ ...newArticle, abstract: e.target.value })}
                    className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded bg-[#D4AF37] text-[#0B0305] font-bold text-xs font-data-mono uppercase tracking-wider hover:brightness-110 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Publicar Artigo</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 4: SUPABASE DATABASE METRICS & SCHEMA */}
          {activeTab === 'database' && (
            <div className="space-y-6">
              <div className="bg-[#180A0E] p-5 rounded-xl border border-[#431520] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-data-mono text-[#D4AF37]">
                    <Database className="w-4 h-4" />
                    <span>STATUS DO BANCO DE DADOS SUPABASE</span>
                  </div>
                  <span
                    className={`text-[10px] font-data-mono px-2 py-0.5 rounded ${
                      isSupabaseConfigured
                        ? missingTablesList.length > 0
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-800 font-bold'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold'
                        : 'bg-[#240A11] text-[#D4AF37] border border-[#431520] font-bold'
                    }`}
                  >
                    {isSupabaseConfigured
                      ? missingTablesList.length > 0
                        ? 'Migração Pendente (PGRST205)'
                        : 'Nuvem Supabase Sincronizada'
                      : 'Sandbox Local Ativo'}
                  </span>
                </div>

                {/* Migrations Alert Box */}
                {isSupabaseConfigured && missingTablesList.length > 0 && (
                  <div className="p-4 rounded-lg bg-[#2B0C13] border border-[#D4AF37]/50 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-data-mono text-[#D4AF37] font-bold">
                      <AlertCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span>TABELAS PENDENTES NO SUPABASE SQL EDITOR</span>
                    </div>
                    <p className="text-xs text-[#E8D8CE] leading-relaxed">
                      Detectamos que a tabela <code className="text-[#D4AF37] font-bold font-data-mono bg-[#180A0E] px-1.5 py-0.5 rounded">public.{missingTablesList.join(', ')}</code> ainda não existe no seu projeto Supabase (erro PostgREST <code className="text-[#D4AF37]">PGRST205</code>).
                    </p>
                    <p className="text-[11px] text-[#A79388] leading-relaxed">
                      Os dados da banca e alterações visuais continuam sendo gravados e preservados no armazenamento local seguro. Basta copiar o script SQL completo abaixo e executá-lo no SQL Editor do seu console Supabase para sincronizar em nuvem.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={copySql}
                        className="px-3.5 py-1.5 rounded bg-[#D4AF37] hover:bg-[#E5C158] text-[#0B0305] text-xs font-bold font-data-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedSql ? 'DDL Copiado!' : 'Copiar Script SQL Completo'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRevalidateTables}
                        disabled={revalidating}
                        className="px-3 py-1.5 rounded bg-[#0B0305] border border-[#431520] hover:border-[#D4AF37] text-xs font-data-mono text-[#E8D8CE] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? 'animate-spin text-[#D4AF37]' : ''}`} />
                        <span>{revalidating ? 'Testando Conexão...' : 'Revalidar Tabelas'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-[#0B0305] p-3 rounded border border-[#431520]">
                    <span className="text-[10px] font-data-mono text-[#A79388] block">firm_configs</span>
                    <span className="font-display-hero text-xl font-bold text-[#FDF9F3]">1</span>
                    <span className="text-[9px] text-[#C5A880] block">
                      {missingTablesList.includes('firm_configs') ? 'Local (PGRST205)' : 'Sincronizado'}
                    </span>
                  </div>
                  <div className="bg-[#0B0305] p-3 rounded border border-[#431520]">
                    <span className="text-[10px] font-data-mono text-[#A79388] block">intake_protocols</span>
                    <span className="font-display-hero text-xl font-bold text-[#FDF9F3]">{intakes.length}</span>
                    <span className="text-[9px] text-[#C5A880] block">Registros em custódia</span>
                  </div>
                  <div className="bg-[#0B0305] p-3 rounded border border-[#431520]">
                    <span className="text-[10px] font-data-mono text-[#A79388] block">practice_areas</span>
                    <span className="font-display-hero text-xl font-bold text-[#FDF9F3]">{practices.length}</span>
                    <span className="text-[9px] text-[#C5A880] block">Núcleos de atuação</span>
                  </div>
                </div>

                <div className="text-xs text-[#E8D8CE] font-light leading-relaxed pt-2 border-t border-[#431520]">
                  {isSupabaseConfigured ? (
                    <p>
                      Instância conectada ao projeto Supabase via <code className="text-[#D4AF37]">VITE_SUPABASE_URL</code>. O sistema possui tolerância ativa a falhas com fallback automático para persistência local caso alguma tabela remota ainda esteja pendente de migração.
                    </p>
                  ) : (
                    <p>
                      O sistema está operando no modo híbrido de persistência local, pronto para sincronizar automaticamente com a nuvem assim que as credenciais do Supabase forem definidas no arquivo <code className="text-[#D4AF37]">.env</code>.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSqlSchema(!showSqlSchema)}
                    className="px-3.5 py-2 rounded bg-[#0B0305] border border-[#431520] hover:border-[#D4AF37] text-xs font-data-mono text-[#E8D8CE] hover:text-[#D4AF37] flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileCode className="w-4 h-4 text-[#D4AF37]" />
                    <span>{showSqlSchema ? 'Ocultar Script SQL' : 'Visualizar Script SQL (PostgreSQL)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={copySql}
                    className="px-3.5 py-2 rounded bg-[#240A11] border border-[#431520] hover:border-[#D4AF37] text-xs font-data-mono text-[#D4AF37] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedSql ? 'Copiado!' : 'Copiar DDL Completo'}</span>
                  </button>
                </div>

                {showSqlSchema && (
                  <div className="bg-[#0B0305] p-3 rounded border border-[#431520] font-data-mono text-[11px] text-[#A79388] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[#D4AF37] font-bold">Instruções de Migração Supabase:</span>
                      <button
                        type="button"
                        onClick={copySql}
                        className="text-[10px] text-[#D4AF37] hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{copiedSql ? 'Copiado!' : 'Copiar Código'}</span>
                      </button>
                    </div>
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-[#E8D8CE]">
                      <li>Abra o painel do seu projeto no Supabase (<strong>supabase.com/dashboard</strong>).</li>
                      <li>Clique em <strong>SQL Editor</strong> no menu lateral esquerdo.</li>
                      <li>Clique em <strong>New query</strong>, cole o script abaixo e clique em <strong>Run</strong>.</li>
                      <li>Volte aqui e clique no botão <strong>Revalidar Tabelas</strong>.</li>
                    </ol>
                    <pre className="max-h-60 overflow-y-auto p-3 rounded bg-[#13060A] border border-[#431520] text-[10px] text-[#C5A880] whitespace-pre font-data-mono select-all">
                      {SUPABASE_SCHEMA_SQL}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
