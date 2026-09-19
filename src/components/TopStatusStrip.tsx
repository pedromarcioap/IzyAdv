import React from 'react';
import { Sliders, ShieldCheck, Database, Palette } from 'lucide-react';
import { FirmConfig, AdminUser } from '../types';
import { getActiveTheme } from '../data/colorThemes';
import { isSupabaseConfigured } from '../lib/supabase';

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

  return (
    <aside className="sticky top-0 z-50 bg-[var(--theme-card)]/95 border-b border-[var(--theme-border)] backdrop-blur-md transition-colors duration-300">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-2 flex flex-wrap items-center justify-between gap-3 text-[11px] font-data-mono tracking-wider">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[var(--theme-gold)] bg-[var(--theme-gold)]/10 px-2.5 py-0.5 rounded border border-[var(--theme-gold)]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--theme-gold)] animate-pulse"></span>
            NOCTURNE & MONOLITH • AMBIENTE RESTRITO
          </span>

          {/* Active Color Theme Indicator */}
          <span className="hidden xl:inline-flex items-center gap-1.5 text-[var(--theme-text-muted)] bg-[var(--theme-surface)] px-2 py-0.5 rounded border border-[var(--theme-border)]">
            <Palette className="w-3 h-3 text-[var(--theme-gold)]" />
            <span>TEMA:</span>
            <span
              className="w-2 h-2 rounded-full inline-block shadow-sm"
              style={{ backgroundColor: activeTheme.primaryTone }}
            />
            <span className="text-[var(--theme-text-main)] font-semibold">{activeTheme.name.split('&')[0].trim()}</span>
          </span>

          <span className="text-[var(--theme-text-muted)] hidden lg:inline">
            INSTÂNCIA: {firmConfig.instanceId}
          </span>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Supabase Status Indicator */}
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--theme-text-muted)]">
            <Database className="w-3 h-3 text-[var(--theme-gold-antique)]" />
            <span className="hidden sm:inline">SUPABASE:</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isSupabaseConfigured
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-[var(--theme-surface)] text-[var(--theme-gold)] border border-[var(--theme-border)]'
              }`}
            >
              {isSupabaseConfigured ? 'CLOUD' : 'SANDBOX'}
            </span>
          </span>

          <span className="hidden md:inline-flex items-center gap-1 text-[var(--theme-text-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--theme-gold-antique)]" />
            <span className="text-[var(--theme-text-main)] font-semibold">VALIDADO STF/OAB</span>
          </span>

          <button
            type="button"
            onClick={onToggleCms}
            className={`transition-colors flex items-center gap-1.5 border px-2.5 py-1 rounded text-[11px] font-data-mono cursor-pointer ${
              isCmsOpen
                ? 'bg-[var(--theme-gold)] text-[var(--theme-bg)] font-bold border-[var(--theme-gold)]'
                : 'text-[var(--theme-gold-antique)] hover:text-[var(--theme-gold)] border-[var(--theme-gold-antique)]/30 hover:border-[var(--theme-gold)]/50 bg-[var(--theme-primary)]/40'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>
              {isCmsOpen
                ? 'FECHAR CMS'
                : currentUser
                ? `CMS: ${currentUser.role}`
                : 'LOGIN SUPABASE CMS'}
            </span>
            {pendingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-[var(--theme-gold)] animate-ping" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};

