import React from 'react';
import { Sliders, ShieldCheck, Database, Palette } from 'lucide-react';
import { FirmConfig, AdminUser } from '../types';
import { getActiveTheme } from '../data/colorThemes';
import { isSupabaseConfiguredNow } from '../lib/supabase';
import { Tooltip } from './Tooltip';

interface TopStatusStripProps {
  firmConfig: FirmConfig;
  isCmsOpen: boolean;
  onToggleCms: () => void;
  pendingCount: number;
  currentUser: AdminUser | null;
}

export const TopStatusStrip: React.FC<TopStatusStripProps> = ({
  firmConfig,
  isCmsOpen,
  onToggleCms,
  pendingCount,
  currentUser,
}) => {
  const activeTheme = getActiveTheme(firmConfig);

  const cmsButtonLabel = (() => {
    if (isCmsOpen) {
      return 'FECHAR CMS';
    }
    if (currentUser) {
      return `CMS: ${currentUser.role}`;
    }
    return 'LOGIN SUPABASE CMS';
  })();

  return (
    <aside className="sticky top-0 z-50 bg-[var(--theme-card)]/95 border-b border-[var(--theme-border)] backdrop-blur-md transition-colors duration-300">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-2 flex flex-wrap items-center justify-between gap-3 text-[11px] font-data-mono tracking-wider">
        <div className="flex items-center gap-3">
          <Tooltip
            title="Ambiente de Operação Restrita"
            position="bottom"
            badge="SEGURANÇA INSTITUCIONAL"
            content="Indica que esta instância opera em regime de segurança elevada (Nocturne & Monolith), com criptografia end-to-end e isolamento de dados de litígios de alta relevância."
          >
            <span className="inline-flex items-center gap-1.5 text-[var(--theme-gold)] bg-[var(--theme-gold)]/10 px-2.5 py-0.5 rounded border border-[var(--theme-gold)]/30 cursor-help">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-gold)] animate-pulse" aria-hidden="true" />
              <span>NOCTURNE & MONOLITH • AMBIENTE RESTRITO</span>
            </span>
          </Tooltip>

          {/* Active Color Theme Indicator */}
          <Tooltip
            title="Paleta Visual Dinâmica da Banca"
            position="bottom"
            badge="DESIGN SYSTEM"
            content={`Tema visual ativo: "${activeTheme.name}". Define todas as tonalidades institucionais, gradientes e contrastes de acessibilidade do portal, ajustável pelo CMS.`}
          >
            <span className="hidden xl:inline-flex items-center gap-1.5 text-[var(--theme-text-muted)] bg-[var(--theme-surface)] px-2 py-0.5 rounded border border-[var(--theme-border)] cursor-help">
              <Palette className="w-3 h-3 text-[var(--theme-gold)]" />
              <span>TEMA:</span>
              <span
                className="w-2 h-2 rounded-full inline-block shadow-sm"
                style={{ backgroundColor: activeTheme.primaryTone }}
              />
              <span className="text-[var(--theme-text-main)] font-semibold">{activeTheme.name.split('&')[0].trim()}</span>
            </span>
          </Tooltip>

          <Tooltip
            title="Identificador Único da Instância"
            position="bottom"
            badge="MULTI-TENANT"
            content="Código de licenciamento exclusivo que garante isolamento das configurações e integridade dos registros contratuais da banca."
          >
            <span className="text-[var(--theme-text-muted)] hidden lg:inline cursor-help">
              INSTÂNCIA: {firmConfig.instanceId}
            </span>
          </Tooltip>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Supabase Status Indicator */}
          <Tooltip
            title="Conexão com Banco de Dados Supabase"
            position="bottom"
            badge="INFRAESTRUTURA"
            content={
              isSupabaseConfiguredNow()
                ? "Modo CLOUD ativo: Conectado ao banco Postgres Supabase em nuvem em tempo real com sincronização de protocolos e conteúdos."
                : "Modo SANDBOX ativo: Operando em ambiente de demonstração local estático com fallback em memória."
            }
          >
            <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--theme-text-muted)] cursor-help">
              <Database className="w-3 h-3 text-[var(--theme-gold-antique)]" />
              <span className="hidden sm:inline">SUPABASE:</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isSupabaseConfiguredNow()
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-[var(--theme-surface)] text-[var(--theme-gold)] border border-[var(--theme-border)]'
                  }`}
              >
                {isSupabaseConfiguredNow() ? 'CLOUD' : 'SANDBOX'}
              </span>
            </span>
          </Tooltip>

          <Tooltip
            title="Conformidade Ética & Normativa"
            position="bottom"
            badge="REGULATÓRIO OAB"
            content="Estrutura desenvolvida sob os ditames do Provimento OAB 205/2021 para publicidade informativa profissional e jurisprudência dos Tribunais Superiores."
          >
            <span className="hidden md:inline-flex items-center gap-1 text-[var(--theme-text-muted)] cursor-help">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--theme-gold-antique)]" />
              <span className="text-[var(--theme-text-main)] font-semibold">VALIDADO STF/OAB</span>
            </span>
          </Tooltip>

          <Tooltip
            title="Painel Administrativo CMS & Governança"
            position="bottom"
            badge="CONTROLE DE ACESSO"
            content={
              currentUser
                ? `Usuário autenticado como ${currentUser.role}. Clique para abrir o painel de gestão de conteúdos, pareceres e protocolos confidenciais.`
                : 'Área restrita a sócios e administradores. Clique para realizar login seguro via Supabase e gerenciar as operações do portal.'
            }
          >
            <button
              type="button"
              onClick={onToggleCms}
              className={`transition-colors flex items-center gap-1.5 border px-2.5 py-1 rounded text-[11px] font-data-mono cursor-pointer ${isCmsOpen
                ? 'bg-[var(--theme-gold)] text-[var(--theme-bg)] font-bold border-[var(--theme-gold)]'
                : 'text-[var(--theme-gold-antique)] hover:text-[var(--theme-gold)] border-[var(--theme-gold-antique)]/30 hover:border-[var(--theme-gold)]/50 bg-[var(--theme-primary)]/40'
                }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{cmsButtonLabel}</span>
              {pendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-[var(--theme-gold)] animate-ping" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
};


