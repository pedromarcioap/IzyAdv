/**
 * Role arithmetic and the mapping between the database role enum and the
 * labels the existing UI already renders.
 *
 * `public.newsletter_admin_role` is the authority. RLS and the Edge Functions
 * enforce it server-side; everything here is for UX (what to show, where to
 * redirect) and must never be the only check on a privileged action.
 */

import type { AdminUser } from '../../types';
import { ADMIN_ROLE_LABELS, type AdminProfile, type AdminRole } from '../../types/newsletter';
import type { AuthenticatedIdentity } from './types';

/** Higher rank implies the permissions of every lower rank. */
export const ROLE_RANK: Record<AdminRole, number> = {
    master_admin: 5,
    admin: 4,
    editor: 3,
    analyst: 2,
    viewer: 1,
};

/** Roles that may open the administrative console at all. */
export const CONSOLE_ROLES: AdminRole[] = ['master_admin', 'admin', 'editor', 'analyst'];

/** Roles that may administer accounts (`admin-users` accepts master_admin only). */
export const ACCOUNT_ADMIN_ROLES: AdminRole[] = ['master_admin'];

/** Roles that may manage newsletter content. Mirrors WRITE_ROLES for the panels. */
export const CONTENT_ROLES: AdminRole[] = ['master_admin', 'admin', 'editor'];

export function isKnownRole(value: unknown): value is AdminRole {
    return typeof value === 'string' && value in ROLE_RANK;
}

export function roleRank(role: AdminRole | null | undefined): number {
    return role ? ROLE_RANK[role] : 0;
}

/** Exact membership: `hasAnyRole(role, ['master_admin'])`. */
export function hasAnyRole(role: AdminRole | null | undefined, allowed: readonly AdminRole[]): boolean {
    return Boolean(role) && allowed.includes(role as AdminRole);
}

/** Hierarchical check: an `admin` satisfies `atLeast(role, 'editor')`. */
export function atLeast(role: AdminRole | null | undefined, required: AdminRole): boolean {
    return roleRank(role) >= ROLE_RANK[required];
}

export function roleLabel(role: AdminRole | null | undefined): string {
    return role ? ADMIN_ROLE_LABELS[role] : 'Sem perfil';
}

/**
 * The legacy `AdminUser['role']` union predates the enum and is what the CMS
 * drawer, the top strip and the user list render. Keep the projection in one
 * place so a new enum value cannot silently render as an empty badge.
 */
export function toLegacyRole(role: AdminRole): AdminUser['role'] {
    if (role === 'master_admin') return 'Master Admin';
    if (role === 'admin') return 'Sócio Titular';
    return 'Advogado Associado';
}

/** Legacy enum value for a label produced by the CMS user form. */
export function fromLegacyRole(label: string): AdminRole {
    if (label === 'Master Admin') return 'master_admin';
    if (label === 'Sócio Titular') return 'admin';
    return 'editor';
}

export function formatLastSeen(value: string | null | undefined): string | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

/** Projects the authenticated identity onto the shape the existing UI consumes. */
export function toLegacyAdminUser(identity: AuthenticatedIdentity): AdminUser {
    return {
        id: identity.userId,
        name: identity.fullName ?? identity.profile.full_name ?? identity.email,
        email: identity.email,
        role: toLegacyRole(identity.role),
        lastSignIn: formatLastSeen(identity.profile.last_seen_at) ?? 'Agora',
        createdAt: new Date(identity.profile.created_at).toLocaleDateString('pt-BR'),
    };
}

export function isActiveProfile(profile: Pick<AdminProfile, 'is_active'> | null | undefined): boolean {
    return Boolean(profile?.is_active);
}
