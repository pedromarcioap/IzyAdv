import React, { useEffect, useState, type ReactNode } from 'react';
import type { AdminRole } from '../../types/newsletter';
import { AccessDeniedScreen, AuthLoadingScreen } from '../../components/auth/AuthStatusScreens';
import { navigate } from '../router/hashRouter';
import { useAuth } from './AuthContext';
import { buildLoginRedirect } from './redirects';
import { hasAnyRole, roleLabel } from './roles';
import { PROFILE_PROMOTION_HINT } from './service';

interface ProtectedRouteProps {
    children: ReactNode;
    /**
     * Roles allowed to render `children`. Omitted means "any authenticated
     * identity with an active profile". This is a UX gate only — the database
     * enforces authorization through RLS and every privileged write goes through
     * an Edge Function that re-checks the role server-side.
     */
    allow?: readonly AdminRole[];
    /** Path the visitor asked for, used to restore the destination after login. */
    requestedPath: string;
}

/**
 * Route guard for the administrative surfaces.
 *
 * Four outcomes, four different screens:
 *   loading         → verification screen (never a flash of the login form)
 *   unauthenticated → replace-history redirect to #/login?redirect=<path>
 *   authenticated, no active profile → denial screen with the missing step
 *   authenticated, insufficient role → denial screen naming the required roles
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allow, requestedPath }) => {
    const { status, user, denial, signOut } = useAuth();
    const [signingOut, setSigningOut] = useState(false);

    const needsRedirect = status === 'unauthenticated';

    useEffect(() => {
        if (!needsRedirect) return;
        // `replace` keeps the protected URL out of the history: Back from the
        // login page must not bounce the user straight into the guard again.
        navigate(buildLoginRedirect(requestedPath), { replace: true });
    }, [needsRedirect, requestedPath]);

    if (status === 'loading' || needsRedirect) {
        return <AuthLoadingScreen message={needsRedirect ? 'Redirecionando para o login…' : undefined} />;
    }

    const handleSignOut = async () => {
        setSigningOut(true);
        try {
            await signOut('local');
            navigate('#/', { replace: true });
        } finally {
            setSigningOut(false);
        }
    };

    if (denial) {
        const remediation =
            denial.reason === 'profile_missing'
                ? PROFILE_PROMOTION_HINT
                : denial.reason === 'profile_inactive' && user
                    ? `update public.admin_profiles\n   set is_active = true, accepted_at = coalesce(accepted_at, now())\n where user_id = '${user.userId}';`
                    : undefined;

        return (
            <AccessDeniedScreen
                title={denial.title}
                message={denial.message}
                remediation={remediation}
                onSignOut={handleSignOut}
                signingOut={signingOut}
            />
        );
    }

    if (!user) {
        return <AuthLoadingScreen message="Restabelecendo a sessão…" />;
    }

    if (allow && !hasAnyRole(user.role, allow)) {
        return (
            <AccessDeniedScreen
                title="Seu perfil não tem acesso a esta área"
                message={`Seu perfil é ${roleLabel(user.role)}. Esta área exige ${allow.map(roleLabel).join(' ou ')
                    }. Peça a um administrador para revisar seu nível em public.admin_profiles.`}
                onSignOut={handleSignOut}
                signingOut={signingOut}
                primaryAction={{ label: 'Ir para o painel', href: '#/admin' }}
            />
        );
    }

    return <>{children}</>;
};
