import { useState, useEffect } from 'react';
import { TopStatusStrip } from './components/TopStatusStrip';
import { Navigation } from './components/Navigation';
import { HeroSection } from './components/HeroSection';
import { StatsStrip } from './components/StatsStrip';
import { PracticeAreas } from './components/PracticeAreas';
import { PartnersDossier } from './components/PartnersDossier';
import { LawReview } from './components/LawReview';
import { ConfidentialIntake } from './components/ConfidentialIntake';
import { Footer } from './components/Footer';
import { FeeCalculatorModal } from './components/FeeCalculatorModal';
import { PartnerScheduleModal } from './components/PartnerScheduleModal';
import { ArticleModal } from './components/ArticleModal';
import { CmsAdminDrawer } from './components/CmsAdminDrawer';
import { SupabaseAuthModal } from './components/SupabaseAuthModal';
import { NewsletterAdminPanel } from './components/admin/newsletter/NewsletterAdminPanel';
import { Mail } from 'lucide-react';
import { logActivity, resolveNewsletterAccess } from './lib/newsletter/config';
import type { AdminRole, NewsletterAccess } from './types/newsletter';

import {
  initialFirmConfig,
  initialPartners,
  initialPractices,
  initialArticles,
  initialIntakes,
} from './data/initialData';
import {
  FirmConfig,
  PartnerDossier,
  PracticeArea,
  LawReviewArticle,
  IntakeProtocol,
  AdminUser,
} from './types';
import { getActiveTheme } from './data/colorThemes';
import {
  getCurrentSessionUser,
  subscribeToAuthChanges,
  supabaseSignOut,
  dbFetchFirmConfig,
  dbSaveFirmConfig,
  dbFetchIntakes,
  dbInsertIntake,
  dbUpdateIntakeStatus,
  dbDeleteIntake,
  dbFetchPractices,
  dbInsertPractice,
  dbFetchArticles,
  dbInsertArticle,
} from './lib/supabase';

export default function App() {
  // Global State
  const [firmConfig, setFirmConfig] = useState<FirmConfig>(initialFirmConfig);
  const [partners] = useState<PartnerDossier[]>(initialPartners);
  const [practices, setPractices] = useState<PracticeArea[]>(initialPractices);
  const [articles, setArticles] = useState<LawReviewArticle[]>(initialArticles);
  const [intakes, setIntakes] = useState<IntakeProtocol[]>(initialIntakes);

  // Authentication State with Supabase
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => getCurrentSessionUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Modals & Drawers
  const [isCmsOpen, setIsCmsOpen] = useState<boolean>(false);

  // Newsletter back office. The role is resolved from public.admin_profiles on
  // open rather than from the session, because authorization lives in the
  // database and must be re-read rather than trusted from client state.
  // `newsletterAccess` carries *why* the module is closed, so the panel can
  // report the real missing precondition instead of a generic denial.
  const [isNewsletterOpen, setIsNewsletterOpen] = useState<boolean>(false);
  const [newsletterRole, setNewsletterRole] = useState<AdminRole | null>(null);
  const [newsletterAccess, setNewsletterAccess] = useState<NewsletterAccess | null>(null);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState<boolean>(false);
  const [selectedPartner, setSelectedPartner] = useState<PartnerDossier | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<LawReviewArticle | null>(null);

  // Prefill state for intake form
  const [prefilledCourt, setPrefilledCourt] = useState<string>('');
  const [prefilledSummary, setPrefilledSummary] = useState<string>('');

  // Sincronização inicial com Supabase Database & Auth Listener
  useEffect(() => {
    async function loadSupabaseData() {
      try {
        const [loadedConfig, loadedIntakes, loadedPractices, loadedArticles] = await Promise.all([
          dbFetchFirmConfig(initialFirmConfig),
          dbFetchIntakes(initialIntakes),
          dbFetchPractices(initialPractices),
          dbFetchArticles(initialArticles),
        ]);
        setFirmConfig(loadedConfig);
        setIntakes(loadedIntakes);
        setPractices(loadedPractices);
        setArticles(loadedArticles);
      } catch (err) {
        console.warn('Erro ao carregar dados do Supabase:', err);
      }
    }
    loadSupabaseData();

    // Inscrever ouvinte de autenticação Supabase
    const unsubscribe = subscribeToAuthChanges((user) => {
      setCurrentUser(user);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Theme resolution
  const activeTheme = getActiveTheme(firmConfig);

  const handleToggleCms = () => {
    if (isCmsOpen) {
      setIsCmsOpen(false);
      return;
    }

    if (currentUser) {
      setIsCmsOpen(true);
    } else {
      setIsAuthModalOpen(true);
    }
  };

  const handleAuthenticated = (user: AdminUser) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    setIsCmsOpen(true);
  };

  const handleLogout = async () => {
    await supabaseSignOut();
    setCurrentUser(null);
    setIsCmsOpen(false);
    setIsNewsletterOpen(false);
    setNewsletterRole(null);
  };

  const handleOpenNewsletter = async () => {
    setIsNewsletterOpen(true);

    try {
      const access = await resolveNewsletterAccess();
      setNewsletterAccess(access);
      // Only an active profile grants a role; 'inactive' returns the stored
      // role for display purposes and must never unlock the panels.
      setNewsletterRole(access.state === 'active' ? access.role : null);

      if (access.state !== 'active') {
        console.warn(`Módulo de newsletter indisponível (${access.state}): ${access.message}`);
      }
    } catch (error) {
      console.warn('Não foi possível verificar o perfil de newsletter:', error);
      setNewsletterRole(null);
      setNewsletterAccess({
        state: 'query_failed',
        role: null,
        title: 'Falha inesperada ao verificar o acesso',
        message: error instanceof Error ? error.message : 'erro desconhecido',
      });
    }
  };

  const scrollToAudience = () => {
    const el = document.getElementById('audiencia');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleApplyFeeToBooking = (court: string, summary: string) => {
    setPrefilledCourt(court);
    setPrefilledSummary(summary);
    scrollToAudience();
  };

  const handleScheduleWithPartner = (partnerName: string, slotDescription: string) => {
    setPrefilledSummary(`Reunião agendada com ${partnerName}. Modalidade: ${slotDescription}.`);
    scrollToAudience();
  };

  const handleConsultThesis = (thesisTitle: string) => {
    setPrefilledSummary(`Consulta doutrinária sobre a tese publicada: "${thesisTitle}".`);
    scrollToAudience();
  };

  const handleSelectPracticeForIntake = (practiceTitle: string) => {
    setPrefilledSummary(`Consulta estratégica relativa ao núcleo de: ${practiceTitle}.`);
    scrollToAudience();
  };

  // Supabase CRUD integrations
  const handleUpdateFirmConfig = async (newCfg: FirmConfig) => {
    setFirmConfig(newCfg);
    await dbSaveFirmConfig(newCfg);
  };

  const handleNewIntake = async (newIntake: IntakeProtocol) => {
    setIntakes((prev) => [newIntake, ...prev]);
    await dbInsertIntake(newIntake);
  };

  const handleUpdateIntakes = async (newIntakes: IntakeProtocol[]) => {
    setIntakes(newIntakes);
  };

  const handleAddPractice = async (newPractice: PracticeArea) => {
    const updated = await dbInsertPractice(newPractice, practices);
    setPractices(updated);
  };

  const handleAddArticle = async (newArticle: LawReviewArticle) => {
    const updated = await dbInsertArticle(newArticle, articles);
    setArticles(updated);
  };

  return (
    <div
      style={
        {
          '--theme-bg': activeTheme.bgTone,
          '--theme-primary': activeTheme.primaryTone,
          '--theme-primary-hover': activeTheme.primaryHover,
          '--theme-card': activeTheme.cardTone,
          '--theme-surface': activeTheme.surfaceTone,
          '--theme-border': activeTheme.borderTone,
          '--theme-gold': activeTheme.goldTone,
          '--theme-gold-antique': activeTheme.goldAntique,
          '--theme-button-gradient': activeTheme.gradientButton,
          '--theme-text-main': activeTheme.textMain,
          '--theme-text-muted': activeTheme.textMuted,
        } as React.CSSProperties
      }
      className="min-h-screen flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text-main)] font-body-default antialiased selection:bg-[var(--theme-gold)] selection:text-[var(--theme-bg)] transition-colors duration-300"
    >
      {/* Sovereign Top Strip */}
      <TopStatusStrip
        firmConfig={firmConfig}
        isCmsOpen={isCmsOpen}
        onToggleCms={handleToggleCms}
        pendingCount={intakes.filter((i) => i.status === 'Pendente').length}
        currentUser={currentUser}
      />

      {/* Luxury Monolith Navigation */}
      <Navigation
        firmConfig={firmConfig}
        onOpenFeeModal={() => setIsFeeModalOpen(true)}
      />

      {/* Main Sections */}
      <main className="flex-1 w-full">
        <HeroSection firmConfig={firmConfig} />

        <StatsStrip />

        <PracticeAreas
          practices={practices}
          onOpenCms={handleToggleCms}
          onSelectPracticeForIntake={handleSelectPracticeForIntake}
        />

        <PartnersDossier
          partners={partners}
          onSelectPartnerForSchedule={(partner) => setSelectedPartner(partner)}
        />

        <LawReview
          articles={articles}
          onSelectArticle={(article) => setSelectedArticle(article)}
        />

        <ConfidentialIntake
          key={`${prefilledCourt}-${prefilledSummary}`}
          firmConfig={firmConfig}
          prefilledCourt={prefilledCourt}
          prefilledSummary={prefilledSummary}
          onNewIntake={handleNewIntake}
        />
      </main>

      {/* Institutional Footer */}
      <Footer firmConfig={firmConfig} />

      {/* Interactive Fee Calculator Modal */}
      <FeeCalculatorModal
        isOpen={isFeeModalOpen}
        onClose={() => setIsFeeModalOpen(false)}
        onApplyToBooking={handleApplyFeeToBooking}
      />

      {/* Partner Schedule Modal */}
      <PartnerScheduleModal
        partner={selectedPartner}
        onClose={() => setSelectedPartner(null)}
        onConfirmSchedule={handleScheduleWithPartner}
      />

      {/* Law Review Doctrinal Modal */}
      <ArticleModal
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
        onConsultThesis={handleConsultThesis}
      />

      {/* Supabase Authentication Gate Modal */}
      <SupabaseAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      {/* White-Label CMS Management Drawer */}
      <CmsAdminDrawer
        isOpen={isCmsOpen}
        onClose={() => setIsCmsOpen(false)}
        firmConfig={firmConfig}
        onUpdateFirmConfig={handleUpdateFirmConfig}
        intakes={intakes}
        onUpdateIntakes={handleUpdateIntakes}
        practices={practices}
        onAddPractice={handleAddPractice}
        articles={articles}
        onAddArticle={handleAddArticle}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Newsletter back office entry point.
          Rendered as an independent overlay so the module can evolve without
          coupling to the existing CMS drawer. */}
      {currentUser ? (
        <button
          type="button"
          onClick={handleOpenNewsletter}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--theme-gold)] bg-[var(--theme-card)] px-4 py-2.5 text-sm font-medium text-[var(--theme-gold)] shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-gold)]"
          aria-label="Abrir painel do informativo"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Informativo
        </button>
      ) : null}

      <NewsletterAdminPanel
        isOpen={isNewsletterOpen}
        onClose={() => {
          void logActivity('newsletter_panel_close', 'Painel do informativo fechado');
          setIsNewsletterOpen(false);
        }}
        role={newsletterRole}
        access={newsletterAccess}
        onRetryAccess={handleOpenNewsletter}
      />
    </div>
  );
}
