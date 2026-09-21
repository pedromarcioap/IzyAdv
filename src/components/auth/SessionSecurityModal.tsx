import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Laptop, Loader2, LogOut, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { describeExpiry, describeUserAgent, formatSessionMoment } from '../../lib/auth/devices';
import { listActiveSessions, type SessionsListing } from '../../lib/auth/service';
import { navigate } from '../../lib/router/hashRouter';
import { APP_ROUTES } from '../../lib/router/routes';

interface SessionSecurityModalProps {
    isOpen: boolean;
    onClose: () => void;
    embedded?: boolean;
}

/**
 * Session management surface.
 *
 * Three scopes, three different consequences, spelled out in the UI because
 * `signOut()` defaults to 'global' — the wrong default for a "Sair" button, and
 * a surprising one when the operator only meant to end this browser's session.
 */
export const SessionSecurityModal: React.FC<SessionSecurityModalProps> = ({ isOpen, onClose, embedded = false }) => {
    const { signOut, user } = useAuth();

    const [listing, setListing] = useState<SessionsListing>({ sessions: [] });
    const [loading, setLoading] = useState(false);
    const [busyScope, setBusyScope] = useState<'local' | 'global' | 'others' | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmGlobal, setConfirmGlobal] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await listActiveSessions();
            setListing(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao listar as sessões ativas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        setMessage(null);
        setConfirmGlobal(false);
        void load();
    }, [isOpen, load]);

    if (!isOpen) return null;

    const handleOthers = async () => {
        setBusyScope('others');
        setMessage(null);
        setError(null);

        const result = await signOut('others');
        setBusyScope(null);

        if (result.error) {
            setError(result.error);
            return;
        }

        setMessage('Sessões dos demais dispositivos encerradas. Esta sessão continua ativa.');
        await load();
    };

    const handleGlobal = async () => {
        setBusyScope('global');
        setError(null);

        const result = await signOut('global');
        setBusyScope(null);
        setConfirmGlobal(false);

        if (result.error) {
            setError(result.error);
            return;
        }

        onClose();
        navigate(APP_ROUTES.home, { replace: true });
    };

    const handleLocal = async () => {
        setBusyScope('local');
        setError(null);

        const result = await signOut('local');
        setBusyScope(null);

        if (result.error) {
            setError(result.error);
            return;
        }

        onClose();
        navigate(APP_ROUTES.home, { replace: true });
    };

    const currentSession = listing.sessions.find((session) => session.isCurrent);

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/85 p-4 backdrop-blur-md">
            <div className="w-full max-w-xl rounded-2xl border border-[#D4AF37]/50 bg-[#13060A] p-6 shadow-2xl">
                <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <div className="mb-1 flex items-center gap-2 font-data-mono text-[11px] text-[#D4AF37]">
                            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>SEGURANÇA DA SESSÃO</span>
                        </div>
                        <h2 className="font-display-hero text-lg font-bold text-[#FDF9F3]">Dispositivos conectados</h2>
                        <p className="mt-1 font-data-mono text-[11px] text-[#A79388]">
                            {user?.email ?? 'Sessão atual'}
                            {user?.expiresAt ? ` • ${describeExpiry(user.expiresAt) ?? ''}` : ''}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        className="cursor-pointer rounded p-1 text-[#A79388] transition-colors hover:bg-white/5 hover:text-[#FDF9F3]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error && (
                    <div
                        role="alert"
                        className="mb-3 flex items-start gap-2 rounded border border-red-800 bg-red-950/70 p-3 font-data-mono text-xs text-red-200"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {message && (
                    <div
                        role="status"
                        className="mb-3 rounded border border-emerald-800 bg-emerald-950/40 p-3 font-data-mono text-xs text-emerald-200"
                    >
                        {message}
                    </div>
                )}

                <div className="mb-4 space-y-2">
                    {loading && (
                        <div className="flex items-center gap-2 rounded border border-[#431520] bg-[#0B0305] p-3 font-data-mono text-[11px] text-[#A79388]">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            <span>Lendo sessões autorizadas…</span>
                        </div>
                    )}

                    {!loading && listing.unavailableReason && (
                        <div className="rounded border border-[#431520] bg-[#180A0E] p-3 font-data-mono text-[11px] leading-relaxed text-[#C5A880]">
                            {listing.unavailableReason}
                        </div>
                    )}

                    {!loading && !listing.unavailableReason && listing.sessions.length === 0 && (
                        <div className="rounded border border-[#431520] bg-[#0B0305] p-3 font-data-mono text-[11px] text-[#A79388]">
                            Nenhuma sessão adicional encontrada para esta conta.
                        </div>
                    )}

                    {listing.sessions.map((session) => {
                        const device = describeUserAgent(session.userAgent);
                        return (
                            <div
                                key={session.sessionId}
                                className={`flex items-start justify-between gap-3 rounded border p-3 ${session.isCurrent
                                        ? 'border-[#D4AF37]/50 bg-[#240A11]/60'
                                        : 'border-[#431520] bg-[#0B0305]'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-[#C5A880]" aria-hidden="true" />
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-display-hero text-sm font-bold text-[#FDF9F3]">
                                                {device.label}
                                            </span>
                                            {session.isCurrent && (
                                                <span className="rounded bg-[#D4AF37] px-1.5 py-0.5 font-data-mono text-[9px] font-bold text-[#0B0305]">
                                                    ESTA SESSÃO
                                                </span>
                                            )}
                                        </div>
                                        <div className="font-data-mono text-[10px] text-[#A79388]">
                                            início {formatSessionMoment(session.createdAt)}
                                            {session.ip ? ` • IP ${session.ip}` : ''}
                                        </div>
                                        <div className="max-w-md truncate font-data-mono text-[10px] text-[#7D6B60]" title={device.detail}>
                                            {device.detail}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex flex-col gap-2 border-t border-[#431520] pt-4">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading || busyScope !== null}
                            className="flex cursor-pointer items-center gap-2 rounded border border-[#431520] bg-[#180A0E] px-3 py-2 font-data-mono text-[11px] uppercase tracking-wider text-[#E8D8CE] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                            <span>Atualizar</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleOthers()}
                            disabled={busyScope !== null || listing.sessions.length < 2}
                            title={
                                listing.sessions.length < 2
                                    ? 'Não há outras sessões ativas para encerrar'
                                    : 'Mantém esta sessão e encerra as demais'
                            }
                            className="cursor-pointer rounded border border-[#431520] bg-[#180A0E] px-3 py-2 font-data-mono text-[11px] uppercase tracking-wider text-[#E8D8CE] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busyScope === 'others' ? 'Encerrando…' : 'Encerrar outras sessões'}
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleLocal()}
                            disabled={busyScope !== null}
                            className="flex cursor-pointer items-center gap-2 rounded border border-[#431520] bg-[#180A0E] px-3 py-2 font-data-mono text-[11px] uppercase tracking-wider text-[#E8D8CE] transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37] disabled:opacity-50"
                        >
                            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{busyScope === 'local' ? 'Saindo…' : 'Sair deste dispositivo'}</span>
                        </button>

                        {!confirmGlobal ? (
                            <button
                                type="button"
                                onClick={() => setConfirmGlobal(true)}
                                disabled={busyScope !== null}
                                className="cursor-pointer rounded border border-red-900/70 bg-red-950/40 px-3 py-2 font-data-mono text-[11px] uppercase tracking-wider text-red-200 transition-colors hover:border-red-700 disabled:opacity-50"
                            >
                                Sair de todos os dispositivos
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleGlobal()}
                                disabled={busyScope !== null}
                                className="cursor-pointer rounded border border-red-700 bg-red-900/60 px-3 py-2 font-data-mono text-[11px] font-bold uppercase tracking-wider text-red-100 transition-colors hover:bg-red-900 disabled:opacity-50"
                            >
                                {busyScope === 'global' ? 'Encerrando tudo…' : 'Confirmar: encerrar em todos os dispositivos'}
                            </button>
                        )}
                    </div>

                    <p className="font-data-mono text-[10px] leading-relaxed text-[#7D6B60]">
                        {currentSession ? 'A sessão marcada como "esta sessão" é a que você está usando agora. ' : ''}
                        O encerramento revoga os refresh tokens imediatamente; um token de acesso já emitido continua
                        válido até expirar (30 minutos neste projeto).
                    </p>
                </div>
            </div>
        </div>
    );
};
