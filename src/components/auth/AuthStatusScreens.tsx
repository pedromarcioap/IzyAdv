import React from 'react';
import { AlertTriangle, Loader2, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';

interface AuthLoadingScreenProps {
    message?: string;
}

/** Shown while the stored session is verified, and while a guard redirects. */
export const AuthLoadingScreen: React.FC<AuthLoadingScreenProps> = ({
    message = 'Verificando sua sessão segura…',
}) => (
    <div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-md"
        role="status"
        aria-live="polite"
    >
        <Loader2 className="h-7 w-7 animate-spin text-[#D4AF37]" aria-hidden="true" />
        <p className="font-data-mono text-xs uppercase tracking-wider text-[#A79388]">{message}</p>
    </div>
);

interface AccessDeniedScreenProps {
    title: string;
    message: string;
    /** SQL or steps that unblock the situation, when one exists. */
    remediation?: string;
    onSignOut: () => void | Promise<void>;
    primaryAction?: { label: string; href: string };
    signingOut?: boolean;
}

/**
 * Rendered instead of the protected surface when the session is valid but the
 * authorization is not. Every denial explains the precise missing
 * precondition: a generic "acesso negado" sends operators hunting for the
 * wrong problem.
 */
export const AccessDeniedScreen: React.FC<AccessDeniedScreenProps> = ({
    title,
    message,
    remediation,
    onSignOut,
    primaryAction,
    signingOut = false,
}) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
        <div className="w-full max-w-lg rounded-2xl border border-[#D4AF37]/40 bg-[#13060A] p-7 shadow-2xl">
            <div className="mb-3 flex items-center gap-2 font-data-mono text-xs text-[#D4AF37]">
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                <span>AUTORIZAÇÃO NEGADA • RLS</span>
            </div>

            <h2 className="mb-2 font-display-hero text-xl font-bold text-[#FDF9F3]">{title}</h2>

            <div className="mb-4 flex items-start gap-2 rounded border border-red-900/70 bg-red-950/60 p-3 text-xs leading-relaxed text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                <span>{message}</span>
            </div>

            {remediation && (
                <pre className="mb-4 max-h-56 overflow-auto rounded border border-[#431520] bg-[#0B0305] p-3 font-data-mono text-[10px] leading-relaxed text-[#C5A880]">
                    {remediation}
                </pre>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                {primaryAction && (
                    <a
                        href={primaryAction.href}
                        className="rounded border border-[#431520] bg-[#180A0E] px-4 py-2 font-data-mono text-xs uppercase tracking-wider text-[#E8D8CE] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37]"
                    >
                        {primaryAction.label}
                    </a>
                )}

                <button
                    type="button"
                    onClick={() => void onSignOut()}
                    disabled={signingOut}
                    className="flex items-center gap-2 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] px-4 py-2 font-data-mono text-xs font-bold uppercase tracking-wider text-[#0B0305] transition-all hover:brightness-110 disabled:opacity-50"
                >
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{signingOut ? 'Encerrando…' : 'Encerrar sessão'}</span>
                </button>
            </div>

            <div className="mt-5 flex items-center gap-1.5 border-t border-[#431520] pt-3 font-data-mono text-[10px] text-[#A79388]">
                <ShieldCheck className="h-3 w-3 text-[#C5A880]" aria-hidden="true" />
                <span>Os dados são protegidos por Row Level Security, não por esta tela.</span>
            </div>
        </div>
    </div>
);
