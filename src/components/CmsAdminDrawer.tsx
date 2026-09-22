import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  FileCheck2,
  BookOpen,
  Palette,
  Database,
  LogOut,
  Users,
  KeyRound,
  Mail,
} from 'lucide-react';
import { FirmConfig, IntakeProtocol, PracticeArea, LawReviewArticle, AdminUser } from '../types';
import {
  isSupabaseConfiguredNow,
  dbFetchAdminUsers,
  dbCreateAdminUser,
  dbDeleteAdminUser,
  getMissingTables,
  resetMissingTables,
  SUPABASE_SCHEMA_SQL,
} from '../lib/supabase';
import { SessionSecurityModal } from './auth/SessionSecurityModal';
import { NewsletterAdminPanel } from './admin/newsletter/NewsletterAdminPanel';
import type { AdminRole, NewsletterAccess } from '../types/newsletter';
import { ThemesTab, CustomColorsState } from './admin/drawer/ThemesTab';
import { BrandingTab } from './admin/drawer/BrandingTab';
import { UsersTab, NewUserFormState } from './admin/drawer/UsersTab';
import { IntakesTab } from './admin/drawer/IntakesTab';
import { ContentTab, NewPracticeState, NewArticleState } from './admin/drawer/ContentTab';
import { DatabaseTab } from './admin/drawer/DatabaseTab';

export type AdminTab = 'themes' | 'branding' | 'users' | 'session' | 'newsletter' | 'intakes' | 'content' | 'database';

const getPresetConfig = (preset: 'standard' | 'arbitrage' | 'agro', currentConfig: FirmConfig): FirmConfig => {
  if (preset === 'standard') {
    return {
      ...currentConfig,
      firmName: 'VERITAS & LEX',
      subTitle: 'Advocacia Estratégica & Precedentes',
      instanceId: 'CARVALHO & MENDES ADVOGADOS ASSOCIADOS (WL-SVR-908)',
      oabRegistry: 'REGISTRO SOCIEDADE OAB/SP Nº 14.892',
      colorThemeId: 'bordeaux',
      activeLitigationValue: 'R$ 4.280.000.000',
      successRate: '98.4%',
      activeYears: '28 Anos',
    };
  }
  if (preset === 'arbitrage') {
    return {
      ...currentConfig,
      firmName: 'CARVALHO, MENDES & ASSOCIADOS',
      subTitle: 'Arbitragem Internacional & Contencioso Superior',
      instanceId: 'ICC-CAM MULTIJURISDICTIONAL FIRM (WL-SVR-772)',
      oabRegistry: 'REGISTRO SOCIEDADE OAB/SP Nº 22.140',
      colorThemeId: 'esmeralda',
      activeLitigationValue: 'R$ 6.150.000.000',
      successRate: '99.1%',
      activeYears: '31 Anos',
    };
  }
  return {
    ...currentConfig,
    firmName: 'BARBOSA, PRADO & SILVEIRA',
    subTitle: 'Direito Tributário, Wealth Planning & Agro Sovereign',
    instanceId: 'AGRO & WEALTH SPECIALIZED ALLIANCE (WL-SVR-405)',
    oabRegistry: 'REGISTRO SOCIEDADE OAB/DF Nº 08.411',
    colorThemeId: 'safira',
    activeLitigationValue: 'R$ 2.890.000.000',
    successRate: '96.8%',
    activeYears: '22 Anos',
  };
};

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
  initialTab?: AdminTab;
  newsletterRole?: AdminRole | null;
  newsletterAccess?: NewsletterAccess | null;
  onRetryNewsletterAccess?: () => void;
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
  initialTab,
  newsletterRole,
  newsletterAccess,
  onRetryNewsletterAccess,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab || 'themes');

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const [showSqlSchema, setShowSqlSchema] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [missingTablesList, setMissingTablesList] = useState<string[]>(() => getMissingTables());
  const [revalidating, setRevalidating] = useState(false);

  const isAdmin = currentUser?.role === 'Master Admin' || currentUser?.role === 'Sócio Titular';
  const isMasterAdmin = currentUser?.role === 'Master Admin';

  const [userList, setUserList] = useState<AdminUser[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState<NewUserFormState>({
    name: '',
    email: '',
    role: 'Advogado Associado',
  });

  useEffect(() => {
    if (isOpen) {
      dbFetchAdminUsers().then((res) => setUserList(res));
      setMissingTablesList(getMissingTables());
    }
  }, [isOpen, activeTab]);

  const [editedConfig, setEditedConfig] = useState<FirmConfig>(firmConfig);

  const [customColors, setCustomColors] = useState<CustomColorsState>({
    primaryTone: firmConfig.customColors?.primaryTone || '#581825',
    cardTone: firmConfig.customColors?.cardTone || '#13060A',
    surfaceTone: firmConfig.customColors?.surfaceTone || '#180A0E',
    borderTone: firmConfig.customColors?.borderTone || '#431520',
    goldTone: firmConfig.customColors?.goldTone || '#D4AF37',
  });

  const [newPractice, setNewPractice] = useState<NewPracticeState>({
    title: '',
    category: '',
    description: '',
    leadership: '',
  });

  const [newArticle, setNewArticle] = useState<NewArticleState>({
    title: '',
    category: 'tributario',
    categoryLabel: 'TRIBUTÁRIO',
    readTime: '7 MIN LEITURA',
    author: '',
    abstract: '',
  });

  if (!isOpen) return null;

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

  const handleSaveBranding = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    onUpdateFirmConfig(editedConfig);
  };

  const applyPreset = (preset: 'standard' | 'arbitrage' | 'agro') => {
    const cfg = getPresetConfig(preset, editedConfig);
    setEditedConfig(cfg);
    onUpdateFirmConfig(cfg);
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

  const handleCreatePractice = (e: React.SyntheticEvent<HTMLFormElement>) => {
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

  const handleCreateArticle = (e: React.SyntheticEvent<HTMLFormElement>) => {
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

  const handleCreateUser = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isMasterAdmin) {
      setUserError('A criação de contas exige perfil Master Admin; o servidor recusa a operação para outros níveis.');
      return;
    }
    if (!newUserForm.name.trim() || !newUserForm.email.trim()) {
      setUserError('Informe o nome completo e o e-mail institucional do sócio.');
      return;
    }
    setUserLoading(true);
    setUserError(null);
    setUserSuccess(null);
    setRecoveryLink(null);

    const res = await dbCreateAdminUser({
      name: newUserForm.name,
      email: newUserForm.email,
      role: newUserForm.role,
    });

    setUserLoading(false);

    if (res.error) {
      setUserError(res.error);
    } else if (res.user) {
      setUserSuccess(`Conta de ${res.user.name || res.user.email} criada como ${res.user.role}.`);
      setRecoveryLink(res.recoveryLink ?? null);
      setNewUserForm({
        name: '',
        email: '',
        role: 'Advogado Associado',
      });
      setUserList((prev) => [...prev.filter((u) => u.id !== res.user!.id), res.user!]);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (!isMasterAdmin) {
      alert('Apenas o Master Admin pode revogar contas de usuário.');
      return;
    }

    if (currentUser?.id === id || currentUser?.email === email) {
      alert('Você não pode excluir sua própria conta.');
      return;
    }

    if (confirm(`Confirma a revogação do acesso de ${email}?`)) {
      const res = await dbDeleteAdminUser(id);
      if (res.error) {
        alert(`Erro ao excluir: ${res.error}`);
      } else {
        setUserList((prev) => prev.filter((u) => u.id !== id));
      }
    }
  };

  const handleRevalidateTables = () => {
    setRevalidating(true);
    resetMissingTables();

    setTimeout(() => {
      if (isSupabaseConfiguredNow()) {
        getMissingTables();
      }
      setMissingTablesList(getMissingTables());
      setRevalidating(false);
    }, 1200);
  };

  const copySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-[#0B0305] border-l border-[#431520] h-full flex flex-col shadow-2xl text-[#E8D8CE]">
        {/* DRAWER HEADER */}
        <div className="p-6 border-b border-[#431520] flex items-center justify-between bg-[#180A0E]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
              <h2 className="font-display-hero text-lg font-bold text-[#FDF9F3]">
                Painel de Controle Institucional (CMS)
              </h2>
            </div>
            <p className="text-xs text-[#A79388] mt-1 font-data-mono">
              Instância: <span className="text-[#D4AF37] font-bold">{firmConfig.instanceId}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded bg-[#0B0305] border border-[#431520] text-xs">
                <span className="text-[#A79388]">Operador:</span>
                <span className="font-bold text-[#FDF9F3]">{currentUser.name || currentUser.email}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 font-data-mono">
                  {currentUser.role}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded bg-rose-950/40 text-rose-300 border border-rose-800/80 hover:bg-rose-900/60 cursor-pointer transition-colors"
              title="Encerrar Sessão Administradora"
            >
              <LogOut className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded bg-[#0B0305] text-[#A79388] border border-[#431520] hover:text-[#FDF9F3] hover:border-[#D4AF37] cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* DRAWER NAVIGATION TABS */}
        <div className="border-b border-[#431520] bg-[#13060A] px-6 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('themes')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'themes'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Temas & Cores</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'branding'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Branding & Dados</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'users'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários RBAC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('session')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'session'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Sessão & Dispositivos</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('newsletter')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'newsletter'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>Newsletter</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('intakes')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'intakes'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Protocolos ({intakes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'content'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Conteúdo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('database')}
            className={`py-3.5 px-3 text-xs font-data-mono font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'database'
                ? 'border-[#D4AF37] text-[#D4AF37] bg-[#180A0E]'
                : 'border-transparent text-[#A79388] hover:text-[#FDF9F3]'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Database SQL</span>
          </button>
        </div>

        {/* DRAWER CONTENT CONTAINER */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'themes' && (
            <ThemesTab
              editedConfig={editedConfig}
              customColors={customColors}
              setCustomColors={setCustomColors}
              handleSelectThemePreset={handleSelectThemePreset}
              handleApplyCustomColors={handleApplyCustomColors}
            />
          )}

          {activeTab === 'branding' && (
            <BrandingTab
              editedConfig={editedConfig}
              setEditedConfig={setEditedConfig}
              handleSaveBranding={handleSaveBranding}
              applyPreset={applyPreset}
              isAdmin={isAdmin}
              onNavigateUsers={() => setActiveTab('users')}
            />
          )}

          {activeTab === 'users' && (
            <UsersTab
              isAdmin={isAdmin}
              isMasterAdmin={isMasterAdmin}
              userList={userList}
              currentUser={currentUser}
              newUserForm={newUserForm}
              setNewUserForm={setNewUserForm}
              userLoading={userLoading}
              userError={userError}
              userSuccess={userSuccess}
              recoveryLink={recoveryLink}
              handleCreateUser={handleCreateUser}
              handleDeleteUser={handleDeleteUser}
            />
          )}

          {activeTab === 'session' && (
            <SessionSecurityModal
              isOpen={true}
              onClose={() => {}}
              embedded={true}
            />
          )}

          {activeTab === 'newsletter' && (
            <NewsletterAdminPanel
              isOpen={true}
              onClose={() => {}}
              role={newsletterRole ?? null}
              access={newsletterAccess}
              onRetryAccess={onRetryNewsletterAccess}
              embedded={true}
            />
          )}

          {activeTab === 'intakes' && (
            <IntakesTab
              intakes={intakes}
              handleStatusChange={handleStatusChange}
              handleDeleteIntake={handleDeleteIntake}
            />
          )}

          {activeTab === 'content' && (
            <ContentTab
              newPractice={newPractice}
              setNewPractice={setNewPractice}
              handleCreatePractice={handleCreatePractice}
              newArticle={newArticle}
              setNewArticle={setNewArticle}
              handleCreateArticle={handleCreateArticle}
            />
          )}

          {activeTab === 'database' && (
            <DatabaseTab
              missingTablesList={missingTablesList}
              revalidating={revalidating}
              copiedSql={copiedSql}
              showSqlSchema={showSqlSchema}
              setShowSqlSchema={setShowSqlSchema}
              copySql={copySql}
              handleRevalidateTables={handleRevalidateTables}
              intakesCount={intakes.length}
              practicesCount={practices.length}
            />
          )}
        </div>
      </div>
    </div>
  );
};
