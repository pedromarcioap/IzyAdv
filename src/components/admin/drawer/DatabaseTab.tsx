import React from 'react';
import { Database, AlertCircle, RefreshCw, FileCode, CheckCircle, Copy, Check } from 'lucide-react';
import { isSupabaseConfiguredNow, SUPABASE_SCHEMA_SQL } from '../../../lib/supabase';

const getDbStatusBadgeClass = (isConfigured: boolean, missingCount: number) => {
  if (!isConfigured) return 'bg-[#240A11] text-[#D4AF37] border border-[#431520] font-bold';
  if (missingCount > 0) return 'bg-amber-950/80 text-amber-300 border border-amber-800 font-bold';
  return 'bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold';
};

const getDbStatusText = (isConfigured: boolean, missingCount: number) => {
  if (!isConfigured) return 'Sandbox Local Ativo';
  if (missingCount > 0) return 'Migração Pendente (PGRST205)';
  return 'Nuvem Supabase Sincronizada';
};

interface DatabaseTabProps {
  missingTablesList: string[];
  revalidating: boolean;
  copiedSql: boolean;
  showSqlSchema: boolean;
  setShowSqlSchema: React.Dispatch<React.SetStateAction<boolean>>;
  copySql: () => void;
  handleRevalidateTables: () => void;
  intakesCount: number;
  practicesCount: number;
}

export const DatabaseTab: React.FC<DatabaseTabProps> = ({
  missingTablesList,
  revalidating,
  copiedSql,
  showSqlSchema,
  setShowSqlSchema,
  copySql,
  handleRevalidateTables,
  intakesCount,
  practicesCount,
}) => {
  const isSupabaseActive = isSupabaseConfiguredNow();
  const missingCount = missingTablesList.length;

  return (
    <div className="space-y-6">
      <div className="bg-[#180A0E] p-4 rounded-xl border border-[#431520] flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#D4AF37] uppercase tracking-wider font-bold">
              Infraestrutura de Banco de Dados Supabase / PostgreSQL
            </span>
          </div>
          <p className="text-xs text-[#A79388]">
            Diagnóstico de conectividade, schema SQL e sincronização em tempo real.
          </p>
        </div>

        <span
          className={`px-3 py-1 rounded text-xs font-data-mono uppercase tracking-wider border ${getDbStatusBadgeClass(
            isSupabaseActive,
            missingCount
          )}`}
        >
          {getDbStatusText(isSupabaseActive, missingCount)}
        </span>
      </div>

      {/* Warning for Missing Migration */}
      {isSupabaseActive && missingCount > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-800 rounded-xl text-amber-200 text-xs space-y-3">
          <div className="flex items-center gap-2 font-bold font-data-mono text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Atenção: Tabelas Ausentes na Instância Nuvem ({missingCount})</span>
          </div>
          <p className="leading-relaxed text-[11px] text-amber-200/90">
            Foi detectado que as tabelas abaixo ainda não foram criadas no seu projeto Supabase. Execute o script SQL no editor SQL do seu painel Supabase para habilitar a sincronização cloud.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {missingTablesList.map((tbl) => (
              <span
                key={tbl}
                className="px-2 py-0.5 rounded bg-amber-950 border border-amber-700/80 font-data-mono text-[10px] text-amber-300 font-bold"
              >
                public.{tbl}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={copySql}
              className="px-3 py-1.5 bg-[#D4AF37] text-[#0B0305] rounded font-data-mono font-bold text-xs uppercase flex items-center gap-1 cursor-pointer"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'Copiado SQL!' : 'Copiar SQL de Migração'}</span>
            </button>

            <button
              type="button"
              onClick={handleRevalidateTables}
              disabled={revalidating}
              className="px-3 py-1.5 bg-[#180A0E] text-[#D4AF37] border border-[#431520] hover:border-[#D4AF37] rounded font-data-mono text-xs uppercase flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${revalidating ? 'animate-spin' : ''}`} />
              <span>{revalidating ? 'Revalidando...' : 'Revalidar Schema'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Metrics Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-[#180A0E] border border-[#431520] space-y-1">
          <div className="text-[10px] font-data-mono text-[#A79388] uppercase">Status do Provider</div>
          <div className="text-sm font-bold text-[#FDF9F3] font-data-mono">
            {isSupabaseActive ? 'Supabase Client Conectado' : 'LocalStorage Fallback'}
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#180A0E] border border-[#431520] space-y-1">
          <div className="text-[10px] font-data-mono text-[#A79388] uppercase">Protocolos Armazenados</div>
          <div className="text-sm font-bold text-[#D4AF37] font-data-mono">
            {intakesCount} Registros
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[#180A0E] border border-[#431520] space-y-1">
          <div className="text-[10px] font-data-mono text-[#A79388] uppercase">Áreas de Prática Ativas</div>
          <div className="text-sm font-bold text-emerald-400 font-data-mono">
            {practicesCount} Especialidades
          </div>
        </div>
      </div>

      {/* SQL Script Accordion */}
      <div className="bg-[#180A0E] rounded-xl border border-[#431520] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSqlSchema(!showSqlSchema)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-[#240A11] transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-[#D4AF37]" />
            <span className="text-xs font-data-mono text-[#FDF9F3] font-bold">
              Visualizar DDL SQL para Criação das Tabelas
            </span>
          </div>
          <span className="text-xs font-data-mono text-[#D4AF37]">
            {showSqlSchema ? '[ Ocultar SQL ]' : '[ Expandir SQL ]'}
          </span>
        </button>

        {showSqlSchema && (
          <div className="p-4 border-t border-[#431520] space-y-3 bg-[#0B0305]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-data-mono text-[#A79388]">
                Copie o conteúdo abaixo e cole no SQL Editor do Dashboard Supabase:
              </span>
              <button
                type="button"
                onClick={copySql}
                className="px-2.5 py-1 bg-[#D4AF37] text-[#0B0305] rounded text-[10px] font-bold font-data-mono uppercase flex items-center gap-1 cursor-pointer"
              >
                {copiedSql ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedSql ? 'Copiado!' : 'Copiar DDL'}</span>
              </button>
            </div>
            <pre className="p-3 rounded bg-[#13060A] border border-[#431520] text-[10px] font-data-mono text-[#E8D8CE] overflow-x-auto max-h-80">
              {SUPABASE_SCHEMA_SQL}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
