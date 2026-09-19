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
    <aside className="sticky top-0 z-50 bg-[#0A0204]/95 border-b border-[#2D121B] backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-2 flex flex-wrap items-center justify-between gap-3 text-[11px] font-data-mono tracking-wider">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[#D4AF37] bg-[#D4AF37]/10 px-2.5 py-0.5 rounded border border-[#D4AF37]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse"></span>
            NOCTURNE & MONOLITH • AMBIENTE RESTRITO
          </span>

          {/* Active Color Theme Indicator */}
          <span className="hidden xl:inline-flex items-center gap-1.5 text-[#A79388] bg-[#180A0E] px-2 py-0.5 rounded border border-[#431520]">
            <Palette className="w-3 h-3 text-[#D4AF37]" />
            <span>TEMA:</span>
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ backgroundColor: activeTheme.primaryTone }}
            />
            <span className="text-[#FDF9F3] font-semibold">{activeTheme.name.split('&')[0].trim()}</span>
          </span>

          <span className="text-[#A79388] hidden lg:inline">
            INSTÂNCIA: {firmConfig.instanceId}
          </span>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Supabase Status Indicator */}
          <span className="inline-flex items-center gap-1.5 text-[10px] text-[#A79388]">
            <Database className="w-3 h-3 text-[#C5A880]" />
            <span className="hidden sm:inline">SUPABASE:</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                isSupabaseConfigured
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-[#240A11] text-[#D4AF37] border border-[#431520]'
              }`}
            >
              {isSupabaseConfigured ? 'CLOUD' : 'SANDBOX'}
            </span>
          </span>

          <span className="hidden md:inline-flex items-center gap-1 text-[#A79388]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#C5A880]" />
            <span className="text-[#E8D8CE] font-semibold">VALIDADO STF/OAB</span>
          </span>

          <button
            type="button"
            onClick={onToggleCms}
            className={`transition-colors flex items-center gap-1.5 border px-2.5 py-1 rounded text-[11px] font-data-mono cursor-pointer ${
              isCmsOpen
                ? 'bg-[#D4AF37] text-[#0B0305] font-bold border-[#D4AF37]'
                : 'text-[#C5A880] hover:text-[#D4AF37] border-[#C5A880]/30 hover:border-[#D4AF37]/50 bg-[#240A11]/40'
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
              <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-ping" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};

