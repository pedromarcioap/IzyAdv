import { useCallback, useEffect, useState } from 'react';
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
import { LoginPage } from './components/auth/LoginPage';
import { SessionSecurityModal } from './components/auth/SessionSecurityModal';
import { NewsletterAdminPanel } from './components/admin/newsletter/NewsletterAdminPanel';
import { Lock, Mail } from 'lucide-react';
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
} from './types';
import { getActiveTheme } from './data/colorThemes';
import { useAuth } from './lib/auth/AuthContext';
import { CONTENT_ROLES, CONSOLE_ROLES } from './lib/auth/roles';
import { ProtectedRoute } from './lib/auth/ProtectedRoute';
import { readRedirectParam } from './lib/auth/redirects';
import { matchesRoute, navigate } from './lib/router/hashRouter';
import { useHashRoute } from './lib/router/useHashRoute';
import { APP_ROUTES } from './lib/router/routes';
import {
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

  // Authentication. The provider verifies the stored session once for the whole
  // tree; `legacyUser` is the same identity projected onto the shape the
  // pre-existing components already render.
  const { legacyUser: currentUser, status, denial, hasRole, signOut } = useAuth();

  // Routing. Admin surfaces are real routes (`#/admin`, `#/admin/newsletter`),
  // which is what makes them guardable, linkable and refresh-safe.
  const route = useHashRoute();
  const requestedPath = route.query.toString() ? `${route.path}?${route.query.toString()}` : route.path;

  const isLoginRoute = matchesRoute(route.path, APP_ROUTES.login);
  const isAdminRoute = matchesRoute(route.path, APP_ROUTES.admin);
  const isNewsletterRoute = matchesRoute(route.path, APP_ROUTES.newsletter);
  const isCmsOpen = isAdminRoute && status === 'authenticated' && Boolean(currentUser);

  // Modals & Drawers that are not route-driven
  const [isSessionPanelOpen, setIsSessionPanelOpen] = useState(false);
  const [isFeeModalOpen, setIsFeeModalOpen] = useState<boolean>(false);
  const [selectedPartner, setSelectedPartner] = useState<PartnerDossier | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<LawReviewArticle | null>(null);

  // Newsletter authorization. The role is re-read from public.admin_profiles on
  // open rather than trusted from client state; `newsletterAccess` carries *why*
  // the module is closed, so the panel reports the real missing precondition.
  const [newsletterRole, setNewsletterRole] = useState<AdminRole | null>(null);
  const [newsletterAccess, setNewsletterAccess] = useState<NewsletterAccess | null>(null);

  // Prefill state for intake form
  const [prefilledCourt, setPrefilledCourt] = useState<string>('');
  const [prefilledSummary, setPrefilledSummary] = useState<string>('');

  // Sincronização inicial com Supabase Database
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
  }, []);

  // Theme resolution
  const activeTheme = getActiveTheme(firmConfig);

  const handleToggleCms = () => {
    if (isCmsOpen) {
      navigate(APP_ROUTES.home);
      return;
    }

    // Navigating is enough: the guard turns this into a redirect to
    // `#/login?redirect=…` when there is no session.
    navigate(APP_ROUTES.admin);
  };

  const handleLogout = async () => {
    await signOut('local');
    setIsSessionPanelOpen(false);
    navigate(APP_ROUTES.home, { replace: true });
  };

  const handleOpenNewsletter = useCallback(async () => {
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
  }, []);

  // Authorization is resolved when the newsletter route is entered, never on
  // the strength of the client-side role alone.
  useEffect(() => {
    if (!isNewsletterRoute || status !== 'authenticated') return;
    void handleOpenNewsletter();
  }, [isNewsletterRoute, status, handleOpenNewsletter]);

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

  const canOpenNewsletter = Boolean(currentUser) && hasRole(CONTENT_ROLES);

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

      {/* Public sign-in route. The guard sends visitors here with `?redirect=`,
          and this page sends them back once authenticated. */}
      {isLoginRoute && (
        <LoginPage
          redirectTo={readRedirectParam(route.query)}
          cameFromProtectedRoute={route.query.has('redirect')}
        />
      )}

      {/* Protected route: administrative console (#/admin) */}
      {isAdminRoute && (
        <ProtectedRoute requestedPath={requestedPath} allow={CONSOLE_ROLES}>
          <CmsAdminDrawer
            isOpen
            onClose={() => navigate(APP_ROUTES.home)}
            firmConfig={firmConfig}
            onUpdateFirmConfig={handleUpdateFirmConfig}
            intakes={intakes}
            onUpdateIntakes={handleUpdateIntakes}
            practices={practices}
            onAddPractice={handleAddPractice}
            articles={articles}
            onAddArticle={handleAddArticle}
            currentUser={currentUser}
            onLogout={() => void handleLogout()}
          />
        </ProtectedRoute>
      )}

      {/* Protected route: newsletter back office (#/admin/newsletter) */}
      {isNewsletterRoute && (
        <ProtectedRoute requestedPath={requestedPath} allow={CONTENT_ROLES}>
          <NewsletterAdminPanel
            isOpen
            onClose={() => {
              void logActivity('newsletter_panel_close', 'Painel do informativo fechado');
              navigate(APP_ROUTES.admin);
            }}
            role={newsletterRole}
            access={newsletterAccess}
            onRetryAccess={handleOpenNewsletter}
          />
        </ProtectedRoute>
      )}

      {/* Back-office entry points. Rendered as independent overlays so each
          module can evolve without coupling to the CMS drawer. */}
      {canOpenNewsletter && !isNewsletterRoute && (
        <button
          type="button"
          onClick={() => navigate(APP_ROUTES.newsletter)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--theme-gold)] bg-[var(--theme-card)] px-4 py-2.5 text-sm font-medium text-[var(--theme-gold)] shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-gold)]"
          aria-label="Abrir painel do informativo"
        >
          <Mail className="h-4 w-4" aria-hidden="true" />
          Informativo
        </button>
      )}

      {currentUser && (
        <button
          type="button"
          onClick={() => setIsSessionPanelOpen(true)}
          className="fixed bottom-5 right-40 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2.5 text-sm font-medium text-[var(--theme-text-muted)] shadow-lg transition-transform hover:scale-105 hover:text-[var(--theme-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-gold)]"
          aria-label="Gerenciar sessões e dispositivos conectados"
        >
          <Lock className="h-4 w-4" aria-hidden="true" />
          Sessão
        </button>
      )}

      <SessionSecurityModal isOpen={isSessionPanelOpen} onClose={() => setIsSessionPanelOpen(false)} />

      {/* A session that authenticated but has no usable authorization is
          reported here, outside the routes, so the explanation is visible no
          matter which page the visitor is on. */}
      {status === 'authenticated' && denial && !isAdminRoute && !isNewsletterRoute && !isLoginRoute && (
        <div
          role="status"
          className="fixed bottom-5 left-5 z-40 max-w-sm rounded-xl border border-[#D4AF37]/40 bg-[#13060A] p-4 shadow-2xl"
        >
          <p className="mb-1 font-data-mono text-[10px] uppercase tracking-wider text-[#D4AF37]">
            Acesso ao painel indisponível
          </p>
          <p className="mb-2 font-display-hero text-sm font-bold text-[#FDF9F3]">{denial.title}</p>
          <p className="font-data-mono text-[10px] leading-relaxed text-[#A79388]">{denial.message}</p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-3 cursor-pointer rounded border border-[#431520] bg-[#180A0E] px-3 py-1.5 font-data-mono text-[10px] uppercase tracking-wider text-[#E8D8CE] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37]"
          >
            Encerrar sessão
          </button>
        </div>
      )}
    </div>
  );
}
