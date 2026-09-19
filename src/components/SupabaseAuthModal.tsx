import React, { useState } from 'react';
import { X, Database, ArrowRight, ShieldCheck, UserCheck, AlertCircle, Info } from 'lucide-react';
import { supabaseSignIn, isSupabaseConfigured } from '../lib/supabase';
import { AdminUser } from '../types';

interface SupabaseAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: AdminUser) => void;
}

export const SupabaseAuthModal: React.FC<SupabaseAuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const res = await supabaseSignIn(email, password);
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.user) {
      onAuthenticated(res.user);
      onClose();
    }
  };

  const handleFillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#13060A] border border-[#D4AF37]/50 rounded-2xl max-w-md w-full p-7 md:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#A79388] hover:text-[#FDF9F3] p-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-[#D4AF37] font-data-mono text-xs mb-2">
          <Database className="w-4 h-4" />
          <span>AUTENTICAÇÃO SUPABASE • RBAC</span>
        </div>

        <h3 className="font-display-hero text-2xl font-bold text-[#FDF9F3] mb-1">
          Acesso ao Gabinete CMS
        </h3>

        <p className="text-xs text-[#A79388] mb-4 leading-relaxed font-light">
          Informe seu e-mail institucional e senha cadastrada. O acesso é restrito aos membros credenciados da banca.
        </p>

        {/* Supabase Status Pill */}
        <div className="mb-4 p-2.5 rounded bg-[#0B0305] border border-[#431520] flex items-center justify-between text-[11px] font-data-mono">
          <span className="text-[#A79388] flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-[#D4AF37]'}`}></span>
            Conexão Supabase:
          </span>
          <span className={isSupabaseConfigured ? 'text-emerald-300 font-bold' : 'text-[#D4AF37] font-bold'}>
            {isSupabaseConfigured ? 'Cloud Ativa' : 'Sandbox Ativo'}
          </span>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-start gap-2 font-data-mono">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
              E-mail Institucional *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="socio@veritaslex.adv.br"
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none font-data-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-data-mono uppercase text-[#A79388] mb-1">
              Senha de Acesso *
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-[#0B0305] border border-[#431520] rounded p-2.5 text-xs text-[#FDF9F3] focus:border-[#C5A880] focus:outline-none font-data-mono"
            />
          </div>

          <div className="pt-2 flex flex-col gap-2.5">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] text-[#0B0305] font-bold text-xs font-data-mono uppercase tracking-wider hover:brightness-110 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(212,175,55,0.25)] transition-all cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Validando Credenciais...' : 'Autenticar com Supabase'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {/* Demo Credentials Quick Switcher */}
            <div className="pt-2">
              <span className="text-[10px] font-data-mono uppercase tracking-wider text-[#A79388] block mb-1.5 text-center">
                Acessos Rápidos de Demonstração
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFillDemo('admin@veritaslex.adv.br', 'Veritas@2025!')}
                  className="py-1.5 px-2 rounded bg-[#180A0E] border border-[#431520] hover:border-[#D4AF37] text-[11px] font-data-mono text-[#E8D8CE] hover:text-[#D4AF37] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <UserCheck className="w-3 h-3 text-[#D4AF37]" />
                  <span>Master Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFillDemo('associado@veritaslex.adv.br', 'Helena@2025!')}
                  className="py-1.5 px-2 rounded bg-[#180A0E] border border-[#431520] hover:border-[#C5A880] text-[11px] font-data-mono text-[#A79388] hover:text-[#FDF9F3] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Adv. Associado</span>
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Informative Security Callout regarding User Creation */}
        <div className="mt-5 pt-4 border-t border-[#431520] space-y-2">
          <div className="p-2.5 rounded bg-[#180A0E] border border-[#431520]/80 flex items-start gap-2 text-[11px] text-[#A79388] font-data-mono leading-relaxed">
            <Info className="w-3.5 h-3.5 text-[#C5A880] shrink-0 mt-0.5" />
            <span>
              A criação de novas contas é realizada exclusivamente na <strong className="text-[#FDF9F3]">página de configurações por usuários administradores</strong>.
            </span>
          </div>

          <div className="flex items-center justify-end text-[10px] font-data-mono text-[#A79388]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-[#C5A880]" />
              Sessão Criptografada JWT / RBAC
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
