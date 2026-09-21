/**
 * Authentication domain types.
 *
 * The role comes from `public.admin_profiles` — the single source of truth read
 * by RLS and by the Edge Functions — and never from `user_metadata`, which the
 * signed-in user can edit about themselves.
 */

import type { AdminProfile, AdminRole } from '../../types/newsletter';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/**
 * Why the console is closed, when it is closed for an authenticated user.
 * Distinguishing these keeps the UI honest: "sem perfil" and "perfil inativo"
 * need different actions from different people.
 */
export type AccessDenialReason = 'session_missing' | 'profile_missing' | 'profile_inactive' | 'insufficient_role';

export interface AuthenticatedIdentity {
    /** auth.users.id — also `auth.uid()` in every policy. */
    userId: string;
    email: string;
    /** Active role read from public.admin_profiles. */
    role: AdminRole;
    profile: AdminProfile;
    fullName: string | null;
    /** `session_id` claim of the current Access Token. */
    sessionId: string | null;
    /** Unix seconds when the current Access Token expires (JWT `exp`). */
    expiresAt: number | null;
}

export interface AccessDenial {
    reason: AccessDenialReason;
    title: string;
    message: string;
}

export interface SignInOutcome {
    identity: AuthenticatedIdentity | null;
    /** Present when the credentials were rejected or the session could not be established. */
    error: string | null;
    /** True when the account authenticated but has no usable console access. */
    denial: AccessDenial | null;
}

export type LogoutScope =
    /** Only this browser/tab. The default for the "Sair" button. */
    | 'local'
    /** Every device. */
    | 'global'
    /** Every device except this one. */
    | 'others';

export interface ActiveSession {
    sessionId: string;
    createdAt: string | null;
    refreshedAt: string | null;
    /** Server-side hard limit for the session; null means "refresh-token bound". */
    notAfter: string | null;
    ip: string | null;
    userAgent: string | null;
    isCurrent: boolean;
}
