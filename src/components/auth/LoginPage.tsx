import React, { useEffect, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowRight,
    Database,
    Eye,
    EyeOff,
    Info,
    Loader2,
    Lock,
    ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { UNCONFIGURED_MESSAGE } from '../../lib/auth/errors';
import { resolvePostLoginTarget } from '../../lib/auth/redirects';
import {
    hasErrors,
    validateLoginForm,
    type LoginFieldErrors,
} from '../../lib/auth/validation';
import { isSupabaseConfiguredNow } from '../../lib/supabase';
import { navigate } from '../../lib/router/hashRouter';
import { APP_ROUTES } from '../../lib/router/routes';
import { AccessDeniedScreen } from './AuthStatusScreens';

interface LoginPageProps {
    /** Destination requested by the guard, e.g. `#/admin/newsletter`. */
    redirectTo?: string | null;
    /** True when a guard rewrote a protected URL into this page. */
    cameFromProtectedRoute?: boolean;
}

/**
 * Sign-in form.
 *
 * The password never leaves this component except as the argument of
 * `signInWithPassword`, which sends it to the Auth server. There is no hash,
 * no storage and no logging of the secret on the client: bcrypt verification
 * happens server-side against `auth.users.encrypted_password`.
 */
export const LoginPage: React.FC<LoginPageProps> = ({ redirectTo, cameFromProtectedRoute = false }) => {
    const { signIn, signOut, status, denial, pending } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [capsLockOn, setCapsLockOn] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    const emailRef = useRef<HTMLInputElement>(null);

    const alreadyAuthenticated = status === 'authenticated' && Boolean(denial) === false;

    // An authenticated visitor has no business on the login page: send them to
    // the destination they originally asked for.
    useEffect(() => {
        if (alreadyAuthenticated) {
            navigate(resolvePostLoginTarget(redirectTo), { replace: true });
        }
    }, [alreadyAuthenticated, redirectTo]);

    useEffect(() => {
        emailRef.current?.focus();
    }, []);

    const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormError(null);

        const errors = validateLoginForm({ email, password });
        setFieldErrors(errors);

        if (hasErrors(errors)) {
            if (errors.email) emailRef.current?.focus();
            return;
        }

        const outcome = await signIn({ email, password });

        if (outcome.error) {
            setFormError(outcome.error);
            setPassword('');
            return;
        }

        if (outcome.denial) {
            // The session exists but the profile denies access; the denial
            // screen below takes over and explains the missing precondition.
            return;
        }

        if (outcome.identity) {
            navigate(resolvePostLoginTarget(redirectTo), { replace: true });
        }
    };

    const handleCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (typeof event.getModifierState === 'function') {
            setCapsLockOn(event.getModifierState('CapsLock'));
        }
    };

    const handleSignOut = async () => {
        setSigningOut(true);
        try {
            await signOut('local');
            setFormError(null);
        } finally {
            setSigningOut(false);
        }
    };

    if (denial) {
        return (
            <AccessDeniedScreen
                title={denial.title}
                message={denial.message}
                onSignOut={handleSignOut}
                signingOut={signingOut}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/90 p-4 backdrop-blur-md">
            <main className="w-full max-w-md rounded-2xl border border-[#D4AF37]/50 bg-[#13060A] p-7 shadow-2xl md:p-8">
                <div className="mb-2 flex items-center gap-2 font-data-mono text-xs text-[#D4AF37]">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    <span>AUTENTICAÇÃO SUPABASE • RBAC</span>
                </div>

                <h1 className="mb-1 font-display-hero text-2xl font-bold text-[#FDF9F3]">Acesso ao Gabinete</h1>

                <p className="mb-4 text-xs font-light leading-relaxed text-[#A79388]">
                    Informe o e-mail institucional e a senha cadastrada. O acesso é restrito aos membros credenciados
                    da banca.
                </p>

                {cameFromProtectedRoute && !formError && (
                    <output
                        className="mb-4 flex items-start gap-2 rounded border border-[#431520] bg-[#180A0E] p-3 font-data-mono text-[11px] leading-relaxed text-[#C5A880]"
                    >
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>É necessário entrar para acessar esta área do painel.</span>
                    </output>
                )}

                {!isSupabaseConfiguredNow() && (
                    <div className="mb-4 flex items-start gap-2 rounded border border-[#D4AF37]/40 bg-[#180A0E] p-3 font-data-mono text-[11px] leading-relaxed text-[#E8D8CE]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" aria-hidden="true" />
                        <span>{UNCONFIGURED_MESSAGE}</span>
                    </div>
                )}

                {formError && (
                    <div
                        role="alert"
                        className="mb-4 flex items-start gap-2 rounded border border-red-800 bg-red-950/70 p-3 font-data-mono text-xs text-red-200"
                    >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                        <span className="leading-relaxed">{formError}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div>
                        <label
                            htmlFor="login-email"
                            className="mb-1 block font-data-mono text-xs uppercase text-[#A79388]"
                        >
                            E-mail institucional
                        </label>
                        <input
                            id="login-email"
                            ref={emailRef}
                            type="email"
                            name="email"
                            autoComplete="username"
                            inputMode="email"
                            spellCheck={false}
                            value={email}
                            onChange={(event) => {
                                setEmail(event.target.value);
                                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                            }}
                            placeholder="nome@dominio.adv.br"
                            aria-invalid={Boolean(fieldErrors.email)}
                            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                            className={`w-full rounded border bg-[#0B0305] p-2.5 font-data-mono text-xs text-[#FDF9F3] focus:outline-none ${fieldErrors.email ? 'border-red-700' : 'border-[#431520] focus:border-[#C5A880]'
                                }`}
                        />
                        {fieldErrors.email && (
                            <p id="login-email-error" className="mt-1 font-data-mono text-[11px] text-red-300">
                                {fieldErrors.email}
                            </p>
                        )}
                    </div>

                    <div>
                        <label
                            htmlFor="login-password"
                            className="mb-1 block font-data-mono text-xs uppercase text-[#A79388]"
                        >
                            Senha
                        </label>
                        <div className="relative">
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => {
                                    setPassword(event.target.value);
                                    if (fieldErrors.password)
                                        setFieldErrors((prev) => ({ ...prev, password: undefined }));
                                }}
                                onKeyUp={handleCapsLock}
                                onKeyDown={handleCapsLock}
                                placeholder="••••••••••••"
                                aria-invalid={Boolean(fieldErrors.password)}
                                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                                className={`w-full rounded border bg-[#0B0305] p-2.5 pr-11 font-data-mono text-xs text-[#FDF9F3] focus:outline-none ${fieldErrors.password ? 'border-red-700' : 'border-[#431520] focus:border-[#C5A880]'
                                    }`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1.5 text-[#A79388] transition-colors hover:text-[#FDF9F3]"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>

                        {capsLockOn && (
                            <p className="mt-1 font-data-mono text-[11px] text-[#C5A880]">
                                Caps Lock está ativado.
                            </p>
                        )}

                        {fieldErrors.password && (
                            <p id="login-password-error" className="mt-1 font-data-mono text-[11px] text-red-300">
                                {fieldErrors.password}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={pending}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded bg-gradient-to-r from-[#D4AF37] to-[#C5A880] py-3 font-data-mono text-xs font-bold uppercase tracking-wider text-[#0B0305] shadow-[0_0_15px_rgba(212,175,55,0.25)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {pending ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                <span>Validando credenciais…</span>
                            </>
                        ) : (
                            <>
                                <span>Entrar no gabinete</span>
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-5 space-y-2 border-t border-[#431520] pt-4">
                    <div className="flex items-start gap-2 rounded border border-[#431520]/80 bg-[#180A0E] p-2.5 font-data-mono text-[11px] leading-relaxed text-[#A79388]">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C5A880]" aria-hidden="true" />
                        <span>
                            A criação e a redefinição de contas acontecem somente pelo painel administrativo, por um
                            master admin. Em ambiente local, use{' '}
                            <code className="text-[#C5A880]">supabase/scripts/bootstrap_first_admin.sql</code>.
                        </span>
                    </div>

                    <div className="flex items-center justify-between font-data-mono text-[10px] text-[#A79388]">
                        {/* History-aware instead of a plain href: leaving the
                            login page must not trigger a full page reload. */}
                        <button
                            type="button"
                            onClick={() => navigate(APP_ROUTES.home)}
                            className="cursor-pointer transition-colors hover:text-[#D4AF37]"
                        >
                            ← Voltar ao site
                        </button>
                        <span className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3 text-[#C5A880]" aria-hidden="true" />
                            Senha verificada por bcrypt no servidor
                        </span>
                    </div>
                </div>
            </main>
        </div>
    );
};
