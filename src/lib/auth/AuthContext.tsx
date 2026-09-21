import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import type { AdminUser } from '../../types';
import type { AdminRole } from '../../types/newsletter';
import { AuthError, describeAuthError } from './errors';
import { hasAnyRole, toLegacyAdminUser } from './roles';
import {
    logAuthEvent,
    markSessionSeen,
    resolveIdentity,
    signInWithPassword,
    signOut as signOutRequest,
    subscribeToAuthEvents,
    verifySession,
} from './service';
import type { AccessDenial, AuthStatus, AuthenticatedIdentity, LogoutScope, SignInOutcome } from './types';
import type { LoginCredentials } from './validation';

export interface AuthContextValue {
    status: AuthStatus;
    /** Authorized identity: a verified session plus an active admin profile. */
    user: AuthenticatedIdentity | null;
    /** Same identity projected onto the shape the existing UI already consumes. */
    legacyUser: AdminUser | null;
    /** Why the console is closed, when the session is valid but unauthorized. */
    denial: AccessDenial | null;
    /** True while a sign-in request is in flight. */
    pending: boolean;
    /** Non-fatal failure while reading the stored session (network, config). */
    sessionError: string | null;
    signIn: (credentials: LoginCredentials) => Promise<SignInOutcome>;
    signOut: (scope?: LogoutScope) => Promise<{ error: string | null }>;
    /** Re-reads the session and profile; used after a timeout or a 401. */
    refresh: () => Promise<void>;
    hasRole: (roles: readonly AdminRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the authentication state machine.
 *
 *   loading         → the stored session is being verified
 *   authenticated   → a verified session exists (even if the profile denies access)
 *   unauthenticated → no usable session
 *
 * The distinction between "authenticated" and "authorized" matters: an
 * authenticated user without an active profile must see *why* the console is
 * closed, not the login form again.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [user, setUser] = useState<AuthenticatedIdentity | null>(null);
    const [denial, setDenial] = useState<AccessDenial | null>(null);
    const [sessionError, setSessionError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const mounted = useRef(true);

    const bootstrap = useCallback(async () => {
        try {
            const snapshot = await verifySession();

            if (!mounted.current) return;

            if (!snapshot) {
                setUser(null);
                setDenial(null);
                setSessionError(null);
                setStatus('unauthenticated');
                return;
            }

            const resolution = await resolveIdentity(snapshot);
            if (!mounted.current) return;

            setUser(resolution.identity);
            setDenial(resolution.denial);
            setSessionError(null);
            setStatus('authenticated');

            if (resolution.identity) {
                void markSessionSeen();
            }
        } catch (error) {
            if (!mounted.current) return;

            // A failed read must not leave the UI stuck on "carregando". The
            // visitor is treated as signed out and told what went wrong.
            setUser(null);
            setDenial(null);
            setSessionError(error instanceof AuthError ? error.message : describeAuthError(error));
            setStatus('unauthenticated');
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        void bootstrap();

        const unsubscribe = subscribeToAuthEvents((event) => {
            if (event === 'SIGNED_OUT') {
                setUser(null);
                setDenial(null);
                setStatus('unauthenticated');
                return;
            }

            if (
                event === 'SIGNED_IN' ||
                event === 'INITIAL_SESSION' ||
                event === 'TOKEN_REFRESHED' ||
                event === 'USER_UPDATED'
            ) {
                void bootstrap();
            }
        });

        return () => {
            mounted.current = false;
            unsubscribe();
        };
    }, [bootstrap]);

    const signIn = useCallback(async (credentials: LoginCredentials): Promise<SignInOutcome> => {
        setPending(true);
        setSessionError(null);

        try {
            const outcome = await signInWithPassword(credentials);

            if (outcome.identity) {
                setUser(outcome.identity);
                setDenial(null);
                setStatus('authenticated');
                // Fire-and-forget: the audit write must never delay the login.
                void logAuthEvent('auth_sign_in', `Entrada no console com o perfil ${outcome.identity.role}`);
                void markSessionSeen();
                return outcome;
            }

            if (outcome.denial) {
                // The session is real; the authorization is not. Keeping it
                // lets the denial screen explain the exact missing precondition.
                setUser(null);
                setDenial(outcome.denial);
                setStatus('authenticated');
                return outcome;
            }

            setUser(null);
            setDenial(null);
            setStatus('unauthenticated');
            return outcome;
        } finally {
            if (mounted.current) setPending(false);
        }
    }, []);

    const signOut = useCallback(async (scope: LogoutScope = 'local') => {
        // Audited before the token is revoked: after signOut the RPC has no
        // identity to attribute the record to.
        if (scope !== 'others') {
            await logAuthEvent('auth_sign_out', scope === 'global' ? 'Saída de todos os dispositivos' : 'Saída do console');
        } else {
            await logAuthEvent('auth_sign_out_others', 'Sessões encerradas nos demais dispositivos');
        }

        const result = await signOutRequest(scope);

        if (scope !== 'others') {
            setUser(null);
            setDenial(null);
            setStatus('unauthenticated');
        }

        return result;
    }, []);

    const hasRole = useCallback((roles: readonly AdminRole[]) => hasAnyRole(user?.role, roles), [user]);

    const legacyUser = useMemo(() => (user ? toLegacyAdminUser(user) : null), [user]);

    const value = useMemo<AuthContextValue>(
        () => ({
            status,
            user,
            legacyUser,
            denial,
            pending,
            sessionError,
            signIn,
            signOut,
            refresh: bootstrap,
            hasRole,
        }),
        [status, user, legacyUser, denial, pending, sessionError, signIn, signOut, bootstrap, hasRole],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth() precisa estar dentro de <AuthProvider>.');
    }
    return context;
}
