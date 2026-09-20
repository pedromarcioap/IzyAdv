/**
 * admin-users
 *
 * User administration for the newsletter back office.
 *
 * Why this exists as an Edge Function instead of direct table access:
 *   - `public.admin_profiles` intentionally has NO insert/update/delete policy,
 *     so an administrator cannot escalate their own role through the Data API.
 *   - Creating or disabling an account requires the Auth admin API, which needs
 *     the service role key and therefore must never run in the browser.
 *   - The initial role is written to `raw_app_meta_data` (app_metadata), which
 *     the signup trigger reads. user_metadata is never trusted for authorization.
 *
 * Only master_admin may call this. Self-destructive operations (demoting,
 * deactivating or deleting your own account) are refused so an operator cannot
 * lock the organisation out of its own back office.
 */

import {
    HttpError,
    AdminRole,
    errorResponse,
    handleOptions,
    json,
    requireAdmin,
    serviceClient,
    structuredLog,
} from '../_shared/core.ts';

type Action =
    | 'list'
    | 'create'
    | 'set_role'
    | 'set_active'
    | 'update_profile'
    | 'delete'
    | 'generate_recovery_link';

const ROLES: AdminRole[] = ['master_admin', 'admin', 'editor', 'analyst', 'viewer'];
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface AdminUsersRequest {
    action: Action;
    user_id?: string;
    email?: string;
    full_name?: string;
    role?: AdminRole;
    is_active?: boolean;
    phone?: string;
}

Deno.serve(async (req: Request) => {
    const preflight = handleOptions(req);
    if (preflight) return preflight;

    try {
        if (req.method !== 'POST') {
            throw new HttpError(405, 'use POST');
        }

        const admin = await requireAdmin(req, ['master_admin']);
        const supabase = serviceClient();
        const body: AdminUsersRequest = await req.json().catch(() => ({}));

        const audit = async (
            action: string,
            entityId: string | null,
            summary: string,
            changes: Record<string, unknown> = {},
        ) => {
            await supabase.from('newsletter_audit_logs').insert({
                actor_id: admin.userId,
                actor_email: admin.email,
                actor_role: admin.role,
                action,
                entity_type: 'admin_profiles',
                entity_id: entityId,
                summary,
                changes,
            });
        };

        const assertNotSelf = (userId: string | undefined, verb: string) => {
            if (userId && userId === admin.userId) {
                throw new HttpError(400, `não é possível ${verb} a própria conta`);
            }
        };

        switch (body.action) {
            // ---------------------------------------------------------------------
            case 'list': {
                const { data, error } = await supabase
                    .from('admin_profiles')
                    .select('user_id, email, full_name, role, is_active, phone, last_seen_at, created_at')
                    .order('created_at', { ascending: true });

                if (error) throw new HttpError(500, 'falha ao listar usuários', error.message);

                return json({ users: data ?? [] });
            }

            // ---------------------------------------------------------------------
            case 'create': {
                const email = (body.email ?? '').trim().toLowerCase();
                const role = body.role ?? 'viewer';

                if (!EMAIL_PATTERN.test(email)) {
                    throw new HttpError(400, 'informe um e-mail válido');
                }
                if (!ROLES.includes(role)) {
                    throw new HttpError(400, `perfil inválido: ${role}`);
                }

                const { data: created, error: createError } = await supabase.auth.admin.createUser({
                    email,
                    // No password is generated here: the account is activated by the
                    // recovery link below, so no credential ever transits this endpoint.
                    email_confirm: true,
                    app_metadata: {
                        newsletter_role: role,
                        full_name: body.full_name ?? null,
                    },
                });

                if (createError) {
                    throw new HttpError(400, 'não foi possível criar o usuário', createError.message);
                }

                const userId = created.user?.id ?? null;

                if (userId) {
                    // The signup trigger has already provisioned the profile as active
                    // with the app_metadata role; fill in the optional fields.
                    await supabase
                        .from('admin_profiles')
                        .update({
                            full_name: body.full_name ?? null,
                            phone: body.phone ?? null,
                            invited_at: new Date().toISOString(),
                            created_by: admin.userId,
                        })
                        .eq('user_id', userId);
                }

                // A recovery link lets the operator deliver access out-of-band, which
                // means this flow does not depend on SMTP being configured.
                let recoveryLink: string | null = null;
                const { data: link } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email,
                });

                recoveryLink = link?.properties?.action_link ?? null;

                await audit('admin_user_create', userId, `Usuário ${email} criado com perfil ${role}`, {
                    email,
                    role,
                });

                return json({ created: true, user_id: userId, role, recovery_link: recoveryLink });
            }

            // ---------------------------------------------------------------------
            case 'set_role': {
                const userId = body.user_id;
                const role = body.role;

                if (!userId) throw new HttpError(400, 'user_id é obrigatório');
                if (!role || !ROLES.includes(role)) throw new HttpError(400, 'perfil inválido');
                assertNotSelf(userId, 'alterar o perfil de');

                const { data: target } = await supabase
                    .from('admin_profiles')
                    .select('role, email')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!target) throw new HttpError(404, 'usuário não encontrado');

                // app_metadata is the trusted source for future sign-ups; the profile
                // table is what RLS reads right now. Both must move together.
                const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
                    app_metadata: { newsletter_role: role },
                });
                if (authError) throw new HttpError(400, 'falha ao atualizar app_metadata', authError.message);

                const { error: profileError } = await supabase
                    .from('admin_profiles')
                    .update({ role })
                    .eq('user_id', userId);
                if (profileError) throw new HttpError(500, 'falha ao atualizar o perfil', profileError.message);

                await audit('admin_user_set_role', userId, `Perfil de ${target.email} alterado para ${role}`, {
                    from: target.role,
                    to: role,
                });

                return json({ updated: true, user_id: userId, role });
            }

            // ---------------------------------------------------------------------
            case 'set_active': {
                const userId = body.user_id;
                if (!userId) throw new HttpError(400, 'user_id é obrigatório');
                if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'is_active deve ser booleano');
                assertNotSelf(userId, 'desativar');

                const { data: target } = await supabase
                    .from('admin_profiles')
                    .select('email, is_active')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!target) throw new HttpError(404, 'usuário não encontrado');

                const { error } = await supabase
                    .from('admin_profiles')
                    .update({
                        is_active: body.is_active,
                        accepted_at: body.is_active ? new Date().toISOString() : null,
                    })
                    .eq('user_id', userId);

                if (error) throw new HttpError(500, 'falha ao atualizar o acesso', error.message);

                // Revoking access must also invalidate live sessions: deleting a user or
                // flagging them inactive does NOT by itself invalidate existing tokens.
                if (!body.is_active) {
                    const { error: signOutError } = await supabase.auth.admin.signOut(userId, 'global');
                    if (signOutError) {
                        structuredLog('warn', 'falha ao revogar sessões', {
                            userId,
                            error: signOutError.message,
                        });
                    }
                }

                await audit(
                    'admin_user_set_active',
                    userId,
                    `Acesso de ${target.email} ${body.is_active ? 'ativado' : 'desativado'}`,
                    { is_active: body.is_active },
                );

                return json({ updated: true, user_id: userId, is_active: body.is_active });
            }

            // ---------------------------------------------------------------------
            case 'update_profile': {
                const userId = body.user_id;
                if (!userId) throw new HttpError(400, 'user_id é obrigatório');

                const { error } = await supabase
                    .from('admin_profiles')
                    .update({
                        full_name: body.full_name ?? null,
                        phone: body.phone ?? null,
                    })
                    .eq('user_id', userId);

                if (error) throw new HttpError(500, 'falha ao atualizar o perfil', error.message);

                await audit('admin_user_update', userId, 'Dados de perfil atualizados', {
                    full_name: body.full_name ?? null,
                });

                return json({ updated: true, user_id: userId });
            }

            // ---------------------------------------------------------------------
            case 'generate_recovery_link': {
                const userId = body.user_id;
                if (!userId) throw new HttpError(400, 'user_id é obrigatório');

                const { data: target } = await supabase
                    .from('admin_profiles')
                    .select('email')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!target?.email) throw new HttpError(404, 'usuário não encontrado');

                const { data: link, error } = await supabase.auth.admin.generateLink({
                    type: 'recovery',
                    email: target.email as string,
                });

                if (error) throw new HttpError(400, 'falha ao gerar o link de recuperação', error.message);

                await audit('admin_user_recovery_link', userId, `Link de recuperação gerado para ${target.email}`);

                return json({ user_id: userId, recovery_link: link?.properties?.action_link ?? null });
            }

            // ---------------------------------------------------------------------
            case 'delete': {
                const userId = body.user_id;
                if (!userId) throw new HttpError(400, 'user_id é obrigatório');
                assertNotSelf(userId, 'excluir');

                const { data: target } = await supabase
                    .from('admin_profiles')
                    .select('email')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!target) throw new HttpError(404, 'usuário não encontrado');

                // Invalidate live sessions before removing the account.
                await supabase.auth.admin.signOut(userId, 'global');

                const { error } = await supabase.auth.admin.deleteUser(userId);
                if (error) throw new HttpError(400, 'falha ao excluir o usuário', error.message);

                await audit('admin_user_delete', userId, `Usuário ${target.email} excluído`, {
                    email: target.email,
                });

                return json({ deleted: true, user_id: userId });
            }

            // ---------------------------------------------------------------------
            default:
                throw new HttpError(400, `ação desconhecida: ${body.action}`);
        }
    } catch (error) {
        return errorResponse(error);
    }
});
