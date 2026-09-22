import React from 'react';
import { Building2, Sliders, Users } from 'lucide-react';
import { FirmConfig } from '../../../types';

interface BrandingTabProps {
  editedConfig: FirmConfig;
  setEditedConfig: React.Dispatch<React.SetStateAction<FirmConfig>>;
  handleSaveBranding: (e: React.SyntheticEvent<HTMLFormElement>) => void;
  applyPreset: (preset: 'standard' | 'arbitrage' | 'agro') => void;
  isAdmin: boolean;
  onNavigateUsers: () => void;
}

export const BrandingTab: React.FC<BrandingTabProps> = ({
  editedConfig,
  setEditedConfig,
  handleSaveBranding,
  applyPreset,
  isAdmin,
  onNavigateUsers,
}) => {
  return (
    <form onSubmit={handleSaveBranding} className="space-y-6">
      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
              Identidade Corporativa & Branding
            </span>
          </div>
          <p className="text-xs text-[#A79388]">
            Configure os dados institucionais exibidos em todos os cabeçalhos, rodapés e relatórios executivos do portal.
          </p>
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-[#D4AF37] text-[#0B0305] rounded font-data-mono font-bold text-xs uppercase tracking-wider hover:brightness-110 cursor-pointer shrink-0"
        >
          Salvar Alterações
        </button>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider block">
          Carregar Perfil Pré-Configurado (Presets Corporativos)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => applyPreset('standard')}
            className="p-3 rounded bg-[#180A0E] border border-[#431520] hover:border-[#D4AF37]/50 text-left cursor-pointer transition-all"
          >
            <div className="text-xs font-bold text-[#FDF9F3] mb-1 font-display-hero">VERITAS & LEX</div>
            <div className="text-[10px] font-data-mono text-[#D4AF37]">Padrao Institucional</div>
            <div className="text-[10px] text-[#A79388] mt-1">Bordeaux | R$ 4,28B Litigation</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('arbitrage')}
            className="p-3 rounded bg-[#180A0E] border border-[#431520] hover:border-[#D4AF37]/50 text-left cursor-pointer transition-all"
          >
            <div className="text-xs font-bold text-[#FDF9F3] mb-1 font-display-hero">CARVALHO & MENDES</div>
            <div className="text-[10px] font-data-mono text-emerald-400">Arbitragem Internacional</div>
            <div className="text-[10px] text-[#A79388] mt-1">Esmeralda | R$ 6,15B Litigation</div>
          </button>

          <button
            type="button"
            onClick={() => applyPreset('agro')}
            className="p-3 rounded bg-[#180A0E] border border-[#431520] hover:border-[#D4AF37]/50 text-left cursor-pointer transition-all"
          >
            <div className="text-xs font-bold text-[#FDF9F3] mb-1 font-display-hero">BARBOSA & PRADO</div>
            <div className="text-[10px] font-data-mono text-amber-400">Agro & Wealth Planning</div>
            <div className="text-[10px] text-[#A79388] mt-1">Safira | R$ 2,89B Litigation</div>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firm-name-input" className="block text-xs font-data-mono text-[#D4AF37] uppercase mb-1">
            Nome do Escritório / Firma
          </label>
          <input
            id="firm-name-input"
            type="text"
            value={editedConfig.firmName}
            onChange={(e) => setEditedConfig({ ...editedConfig, firmName: e.target.value })}
            className="w-full bg-[#180A0E] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
            placeholder="Ex: VERITAS & LEX ADVOGADOS"
          />
        </div>

        <div>
          <label htmlFor="sub-title-input" className="block text-xs font-data-mono text-[#D4AF37] uppercase mb-1">
            Subtítulo / Posicionamento
          </label>
          <input
            id="sub-title-input"
            type="text"
            value={editedConfig.subTitle}
            onChange={(e) => setEditedConfig({ ...editedConfig, subTitle: e.target.value })}
            className="w-full bg-[#180A0E] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none"
            placeholder="Ex: Advocacia Estratégica & Precedentes"
          />
        </div>

        <div>
          <label htmlFor="instance-id-input" className="block text-xs font-data-mono text-[#D4AF37] uppercase mb-1">
            Identificador da Instância (Servidor)
          </label>
          <input
            id="instance-id-input"
            type="text"
            value={editedConfig.instanceId}
            onChange={(e) => setEditedConfig({ ...editedConfig, instanceId: e.target.value })}
            className="w-full bg-[#180A0E] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none font-data-mono"
            placeholder="Ex: WL-SVR-908"
          />
        </div>

        <div>
          <label htmlFor="oab-registry-input" className="block text-xs font-data-mono text-[#D4AF37] uppercase mb-1">
            Registro OAB Sociedade
          </label>
          <input
            id="oab-registry-input"
            type="text"
            value={editedConfig.oabRegistry}
            onChange={(e) => setEditedConfig({ ...editedConfig, oabRegistry: e.target.value })}
            className="w-full bg-[#180A0E] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none font-data-mono"
            placeholder="Ex: REGISTRO SOCIEDADE OAB/SP Nº 14.892"
          />
        </div>
      </div>

      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] space-y-4">
        <div className="flex items-center gap-2 text-xs font-data-mono text-[#D4AF37] uppercase">
          <Sliders className="w-4 h-4" />
          <span>Métricas de Destaque no Portal (Strip de Performance)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="litigation-value-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Volume em Litígio (R$)
            </label>
            <input
              id="litigation-value-input"
              type="text"
              value={editedConfig.activeLitigationValue}
              onChange={(e) => setEditedConfig({ ...editedConfig, activeLitigationValue: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none font-data-mono"
            />
          </div>

          <div>
            <label htmlFor="success-rate-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Taxa de Êxito (%)
            </label>
            <input
              id="success-rate-input"
              type="text"
              value={editedConfig.successRate}
              onChange={(e) => setEditedConfig({ ...editedConfig, successRate: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none font-data-mono"
            />
          </div>

          <div>
            <label htmlFor="active-years-input" className="block text-[10px] font-data-mono uppercase text-[#A79388] mb-1">
              Anos de Tradição
            </label>
            <input
              id="active-years-input"
              type="text"
              value={editedConfig.activeYears}
              onChange={(e) => setEditedConfig({ ...editedConfig, activeYears: e.target.value })}
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2 text-xs text-[#FDF9F3] focus:border-[#D4AF37] focus:outline-none font-data-mono"
            />
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="p-3 rounded bg-[#180A0E] border border-[#431520] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs text-[#A79388]">Gestão de Usuários Administradores</span>
          </div>
          <button
            type="button"
            onClick={onNavigateUsers}
            className="text-xs text-[#D4AF37] underline hover:brightness-125 cursor-pointer font-data-mono"
          >
            Gerenciar Usuários &rarr;
          </button>
        </div>
      )}
    </form>
  );
};
