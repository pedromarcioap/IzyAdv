/**
 * Auth error classification. Pure module: accepts a plain error-like object and
 * returns an `AuthError`, so the mapping is unit-testable and the callers never
 * depend on the shape of a Supabase error class.
 *
 * Every message here is user-facing and actionable. "Invalid login credentials"
 * is wrong twice: the UI language is Portuguese and it does not tell the user
 * what to do next. A message must never reveal whether the *account* or the
 * *password* was wrong — that difference is an account-enumeration oracle.
 */

export type AuthErrorCode =
    | 'unconfigured'
    | 'invalid_credentials'
    | 'email_not_confirmed'
    | 'account_disabled'
    | 'rate_limited'
    | 'session_missing'
    | 'session_expired'
    | 'profile_missing'
    | 'profile_inactive'
    | 'network'
    | 'service_unavailable'
    | 'unknown';

export interface AuthErrorLike {
    message?: string;
    code?: string;
    status?: number;
    name?: string;
}

export class AuthError extends Error {
    readonly code: AuthErrorCode;
    readonly status?: number;
    /** True when retrying later can plausibly succeed (rate limit, network, 5xx). */
    readonly retriable: boolean;
    /** Original message, kept for logs and for the "ver detalhes" disclosure. */
    readonly original?: string;

    constructor(
        code: AuthErrorCode,
        message: string,
        options: { status?: number; retriable?: boolean; original?: string } = {},
    ) {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.status = options.status;
        this.retriable = options.retriable ?? false;
        this.original = options.original;
    }
}

export const UNCONFIGURED_MESSAGE =
    'Supabase não está configurado neste ambiente. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para habilitar o login.';

export function unconfiguredError(): AuthError {
    return new AuthError('unconfigured', UNCONFIGURED_MESSAGE);
}

function haystack(error: AuthErrorLike): string {
    return `${error.code ?? ''} ${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
}

/**
 * True for the errors that mean "the stored session is no longer usable":
 * revoked by signOut on another device, deleted user, expired refresh token.
 * Callers use this to clear local session state instead of looping retries.
 */
export function isSessionInvalidError(error: AuthErrorLike | null | undefined): boolean {
    if (!error) return false;
    const text = haystack(error);
    return (
        error.status === 401 ||
        text.includes('session_not_found') ||
        text.includes('session missing') ||
        text.includes('auth session missing') ||
        text.includes('refresh_token_not_found') ||
        text.includes('invalid refresh token') ||
        text.includes('refresh token not found') ||
        text.includes('invalid claim') ||
        text.includes('user_not_found') ||
        text.includes('user not found')
    );
}

export function classifyAuthError(error: AuthErrorLike | null | undefined): AuthError {
    if (!error) {
        return new AuthError('unknown', 'Não foi possível concluir a autenticação. Tente novamente.');
    }

    const text = haystack(error);
    const status = error.status;
    const original = error.message;

    if (isSessionInvalidError(error)) {
        return new AuthError(
            'session_expired',
            'Sua sessão expirou ou foi encerrada em outro dispositivo. Entre novamente para continuar.',
            { status, original },
        );
    }

    if (text.includes('invalid login credentials') || text.includes('invalid_credentials')) {
        // Deliberately identical for a wrong e-mail and a wrong password.
        return new AuthError(
            'invalid_credentials',
            'E-mail ou senha incorretos. Confira os dados e tente novamente.',
            { status, original },
        );
    }

    if (text.includes('email not confirmed') || text.includes('email_not_confirmed')) {
        return new AuthError(
            'email_not_confirmed',
            'Este e-mail ainda não foi confirmado. Solicite a confirmação a um administrador do gabinete.',
            { status, original },
        );
    }

    if (
        text.includes('user is banned') ||
        text.includes('user_banned') ||
        text.includes('banned') ||
        text.includes('disabled') ||
        text.includes('user_disabled')
    ) {
        return new AuthError(
            'account_disabled',
            'Esta conta está desativada. Procure um administrador para reativar o acesso.',
            { status, original },
        );
    }

    if (
        text.includes('rate limit') ||
        text.includes('too many requests') ||
        text.includes('over_request_rate_limit') ||
        text.includes('over_email_send_rate_limit') ||
        status === 429
    ) {
        return new AuthError(
            'rate_limited',
            'Muitas tentativas em sequência. Aguarde alguns instantes antes de tentar novamente.',
            { status, retriable: true, original },
        );
    }

    if (
        text.includes('failed to fetch') ||
        text.includes('networkerror') ||
        text.includes('network request failed') ||
        text.includes('authretryablefetcherror') ||
        text.includes('load failed')
    ) {
        return new AuthError(
            'network',
            'Não foi possível falar com o serviço de autenticação. Verifique sua conexão e tente novamente.',
            { retriable: true, original },
        );
    }

    if (status !== undefined && status >= 500) {
        return new AuthError(
            'service_unavailable',
            'O serviço de autenticação está indisponível no momento. Tente novamente em instantes.',
            { status, retriable: true, original },
        );
    }

    return new AuthError(
        'unknown',
        original?.trim()
            ? `Falha na autenticação: ${original}`
            : 'Falha inesperada na autenticação. Tente novamente.',
        { status, original },
    );
}

/** Convenience for call sites that only need the message. */
export function describeAuthError(error: unknown): string {
    if (error instanceof AuthError) return error.message;
    if (error instanceof Error) return classifyAuthError(error).message;
    return classifyAuthError(null).message;
}
