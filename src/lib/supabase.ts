import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FirmConfig, IntakeProtocol, PracticeArea, LawReviewArticle, AdminUser } from '../types';
import type { AdminRole } from '../types/newsletter';
import { formatLastSeen, fromLegacyRole, toLegacyRole } from './auth/roles';

// `import.meta.env` only exists in the Vite bundle. Reading it defensively keeps
// this module importable from plain Node (scripts/tests/*.ts), so the auth
// helpers that depend on it stay unit-testable without a browser.
//
// The values are resolved LAZILY, on first use, instead of at module-evaluation
// time. ES module imports are hoisted and evaluated before any top-level
// statement of the importing file, so a host that injects the environment after
// the import graph starts (a `dotenv.config()` call, a runtime secret loader, a
// test bootstrap) would otherwise be invisible: the module would cache
// `isSupabaseConfigured = false` and `supabase = null` forever, and every auth
// call would report "Supabase não está configurado" even though the credentials
// are present. Resolving on demand removes that ordering trap.
function readEnv(): Record<string, string | undefined> {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  // `process` is read through `globalThis` so the module stays type-checkable
  // without pulling in the Node type definitions (the browser bundle has no
  // `process`, and `@types/node` is not a dependency of the app build).
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const nodeEnv = nodeProcess?.env;
  return { ...nodeEnv, ...viteEnv };
}

function resolveSupabaseConfig(): { url: string; anonKey: string } {
  // `readEnv()` already merges `process.env` (Node/test hosts) with
  // `import.meta.env` (the Vite bundle), with the Vite values taking precedence.
  const env = readEnv();
  return {
    url: env.VITE_SUPABASE_URL || '',
    anonKey: env.VITE_SUPABASE_ANON_KEY || '',
  };
}

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

/**
 * Returns the shared Supabase client, creating it on first use.
 *
 * The client is cached against the resolved URL/key pair, so a later change to
 * the environment (a test that sets the variables after import) produces a new
 * client instead of silently reusing a `null` one.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = resolveSupabaseConfig();
  const configured = Boolean(url && anonKey && url.startsWith('http'));

  if (!configured) {
    cachedClient = null;
    cachedSignature = '';
    return null;
  }

  const signature = `${url}\u0000${anonKey}`;
  if (cachedClient && cachedSignature === signature) return cachedClient;

  cachedClient = createClient(url, anonKey);
  cachedSignature = signature;
  return cachedClient;
}

/** True when the environment carries a usable Supabase URL + publishable key. */
export function isSupabaseConfiguredNow(): boolean {
  const { url, anonKey } = resolveSupabaseConfig();
  return Boolean(url && anonKey && url.startsWith('http'));
}

/**
 * Module-local alias used by the CRUD helpers below.
 *
 * It is a *function*, not a captured value, so every call re-resolves the
 * environment. This is what makes the module safe to import before the host has
 * populated `process.env` / `import.meta.env`: the first real call sees the
 * variables, and the `null` return keeps the `if (!client)` guards meaningful.
 */
function supabaseClient(): SupabaseClient | null {
  return getSupabaseClient();
}

/**
 * Backwards-compatible view of the configuration flag.
 *
 * This is a snapshot taken when the module is first evaluated. It is kept only
 * for call sites that read the flag once at startup; anything that must react to
 * an environment populated after import should call `isSupabaseConfiguredNow()`.
 *
 * @deprecated Prefer `isSupabaseConfiguredNow()` so the answer reflects the
 * environment at the moment of the check instead of at import time.
 */
export const isSupabaseConfigured = isSupabaseConfiguredNow();

// Local fallback storage keys for public site content.
//
// Authentication is deliberately NOT persisted here. The session lives in the
// Supabase client's own storage entry (`sb-<ref>-auth-token`), and passwords
// never reach the browser at all: they are verified server-side against the
// bcrypt hash (per-user salt) that GoTrue keeps in auth.users.encrypted_password.
// The previous plaintext registry (`veritas_supabase_admin_users`, which stored
// passwords in the clear) was removed — see docs/auth/README.md.
const STORAGE_KEYS = {
  FIRM_CONFIG: 'veritas_supabase_firm_config',
  INTAKES: 'veritas_supabase_intakes',
  PRACTICES: 'veritas_supabase_practices',
  ARTICLES: 'veritas_supabase_articles',
  SUBSCRIBERS: 'veritas_supabase_subscribers',
};

// ============================================================================
// ADMIN USER ADMINISTRATION
//
// Reads go straight to `public.admin_profiles` and are filtered by RLS (a
// signed-in user sees their own row; master_admin/admin see the roster).
// Writes have no table policy on purpose — a client must never be able to grant
// itself a role — so every mutation goes through the `admin-users` Edge
// Function, which holds the service role key and re-checks the caller's role.
// ============================================================================

const ADMIN_USERS_FUNCTION_HINT =
  'A Edge Function admin-users não respondeu neste ambiente. Localmente ela exige Docker (`supabase functions serve admin-users`); no projeto publicado, `supabase functions deploy admin-users`.';

interface AdminUsersPayload {
  error?: string;
  user_id?: string | null;
  recovery_link?: string | null;
}

/** Reads the active admin roster from `public.admin_profiles`. */
export async function dbFetchAdminUsers(): Promise<AdminUser[]> {
  const client = supabaseClient();
  if (!client) return [];

  const { data, error } = await client
    .from('admin_profiles')
    .select('user_id, email, full_name, role, is_active, last_seen_at, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    handleSupabaseError('admin_profiles', 'select', error);
    return [];
  }

  const rows = (data ?? []) as {
    user_id: string;
    email: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    last_seen_at: string | null;
    created_at: string | null;
  }[];

  return rows
    .filter((row) => row.is_active)
    .map((row) => ({
      id: row.user_id,
      name: row.full_name ?? undefined,
      email: row.email,
      role: toLegacyRole(row.role as AdminRole),
      lastSignIn: formatLastSeen(row.last_seen_at),
      createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : undefined,
    }));
}

/**
 * Creates an account through the Auth Admin API (Edge Function).
 *
 * The operator's password field is intentionally ignored: the account is created
 * without a usable credential and the new member receives a single-use recovery
 * link, so no plaintext password travels through a chat, a clipboard or this
 * client. The link is returned so the administrator can hand it over.
 */
export async function dbCreateAdminUser(newUser: {
  name: string;
  email: string;
  role: 'Master Admin' | 'Sócio Titular' | 'Advogado Associado';
  password?: string;
}): Promise<{ user: AdminUser | null; error: string | null; recoveryLink?: string | null }> {
  const client = supabaseClient();
  if (!client) {
    return { user: null, error: 'Supabase não está configurado: não é possível provisionar contas.' };
  }

  const normalizedEmail = newUser.email.trim().toLowerCase();
  const normalizedName = newUser.name.trim();

  if (!normalizedEmail || !normalizedName) {
    return { user: null, error: 'Informe o nome completo e o e-mail institucional do usuário.' };
  }

  const { data, error } = await client.functions.invoke('admin-users', {
    body: {
      action: 'create',
      email: normalizedEmail,
      full_name: normalizedName,
      role: fromLegacyRole(newUser.role),
    },
  });

  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 404 || status === undefined) {
      return { user: null, error: ADMIN_USERS_FUNCTION_HINT };
    }
    return { user: null, error: error.message || 'Falha ao criar a conta.' };
  }

  const payload = (data ?? {}) as AdminUsersPayload;
  if (payload.error) {
    return { user: null, error: payload.error };
  }

  return {
    user: {
      id: payload.user_id ?? `pendente-${normalizedEmail}`,
      name: normalizedName,
      email: normalizedEmail,
      role: newUser.role,
      lastSignIn: 'Nunca acessou',
      createdAt: new Date().toLocaleDateString('pt-BR'),
    },
    recoveryLink: payload.recovery_link ?? null,
    error: null,
  };
}

/**
 * Revokes an account. The Edge Function ends every session for that user before
 * deleting the record, so the removal takes effect immediately instead of when
 * the access token happens to expire.
 */
export async function dbDeleteAdminUser(userId: string): Promise<{ deleted: boolean; error: string | null }> {
  const client = supabaseClient();
  if (!client) {
    return { deleted: false, error: 'Supabase não está configurado.' };
  }

  const { data, error } = await client.functions.invoke('admin-users', {
    body: { action: 'delete', user_id: userId },
  });

  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 404 || status === undefined) {
      return { deleted: false, error: ADMIN_USERS_FUNCTION_HINT };
    }
    return { deleted: false, error: error.message || 'Falha ao remover a conta.' };
  }

  const payload = (data ?? {}) as AdminUsersPayload;
  if (payload.error) {
    return { deleted: false, error: payload.error };
  }

  return { deleted: true, error: null };
}

// ----------------------------------------------------------------------------
// Authentication lives in src/lib/auth/*.
//
// Removed from this module on purpose:
//   * the plaintext credential registry (`veritas_supabase_admin_users`) and the
//     demo accounts it carried — passwords must exist only as server-side bcrypt
//     hashes in auth.users.encrypted_password;
//   * the "sandbox" sign-in that compared a password from localStorage, which
//     made the client the verifier and turned an XSS into a full credential dump;
//   * the ad-hoc session mirror in localStorage, superseded by verified claims
//     (supabase.auth.getClaims) plus a server-confirmed getSession/getUser pair.
//
// See docs/auth/README.md for the flow and auth_verification.sql for the
// database-level invariants that keep it honest.
// ----------------------------------------------------------------------------

// ============================================================================
// SUPABASE DATABASE RESILIENCE & SCHEMA CACHE HANDLING
// ============================================================================

export { SUPABASE_SCHEMA_SQL } from './supabaseSchema';

// Track tables that are not yet created in the Supabase schema cache
const missingTables = new Set<string>();

export function isTableMissing(tableName: string): boolean {
  return missingTables.has(tableName);
}

export function getMissingTables(): string[] {
  return Array.from(missingTables);
}

export function resetMissingTables(): void {
  missingTables.clear();
}

function handleSupabaseError(tableName: string, operation: string, error: unknown): void {
  if (!error) return;
  const err = error as { code?: string; message?: string };
  const isMissing =
    err.code === 'PGRST205' ||
    err.code === '42P01' ||
    (typeof err.message === 'string' &&
      (err.message.includes('Could not find the table') ||
        (err.message.includes('relation') && err.message.includes('does not exist'))));

  if (isMissing) {
    missingTables.add(tableName);
    console.info(
      `[Supabase Sync] A tabela 'public.${tableName}' ainda não foi provisionada no Supabase (Código: ${err.code || 'PGRST205'}). Os dados estão sendo salvos e servidos com total integridade via persistência local até que o script DDL seja executado no SQL Editor do Supabase.`
    );
  } else if (err.code !== 'PGRST116') {
    console.warn(`[Supabase ${operation} - ${tableName}]:`, err.message || err);
  }
}

// ============================================================================
// SUPABASE DATABASE CRUD SERVICES
// ============================================================================

// 1. Firm Config
export async function dbFetchFirmConfig(defaultConfig: FirmConfig): Promise<FirmConfig> {
  const client = supabaseClient();
  if (client && !missingTables.has('firm_configs')) {
    try {
      const { data, error } = await client
        .from('firm_configs')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        handleSupabaseError('firm_configs', 'select', error);
      } else if (data?.config_json) {
        return data.config_json as FirmConfig;
      }
    } catch (err) {
      handleSupabaseError('firm_configs', 'select', err);
    }
  }

  // Local fallback
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.FIRM_CONFIG);
    if (cached) return JSON.parse(cached);
  } catch {
    // Ignore error
  }
  return defaultConfig;
}

export async function dbSaveFirmConfig(config: FirmConfig): Promise<boolean> {
  // Always persist locally first for instant user response
  try {
    localStorage.setItem(STORAGE_KEYS.FIRM_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.warn('Falha ao salvar firm_config no localStorage:', err);
  }

  const client = supabaseClient();
  if (client && !missingTables.has('firm_configs')) {
    try {
      const { error } = await client.from('firm_configs').upsert({
        id: 1,
        firm_name: config.firmName,
        instance_id: config.instanceId,
        config_json: config,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        handleSupabaseError('firm_configs', 'upsert', error);
        return false;
      }
      return true;
    } catch (err) {
      handleSupabaseError('firm_configs', 'upsert', err);
      return false;
    }
  }
  return true;
}

// 2. Intake Protocols
export async function dbFetchIntakes(defaultIntakes: IntakeProtocol[]): Promise<IntakeProtocol[]> {
  const client = supabaseClient();
  if (client && !missingTables.has('intake_protocols')) {
    try {
      const { data, error } = await client
        .from('intake_protocols')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError('intake_protocols', 'select', error);
      } else if (data?.length) {
        return data.map((row) => ({
          id: row.id,
          protocolCode: row.protocol_code,
          clientName: row.client_name,
          corporateRole: row.corporate_role,
          groupName: row.group_name,
          email: row.email,
          court: row.court,
          estimatedValue: row.estimated_value,
          briefSummary: row.brief_summary,
          submittedAt: row.created_at ? new Date(row.created_at).toLocaleTimeString('pt-BR') : 'Hoje',
          status: row.status,
        }));
      }
    } catch (err) {
      handleSupabaseError('intake_protocols', 'select', err);
    }
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEYS.INTAKES);
    if (cached) return JSON.parse(cached);
  } catch {
    // Ignore error
  }
  return defaultIntakes;
}

export async function dbInsertIntake(intake: IntakeProtocol): Promise<boolean> {
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.INTAKES);
    const list: IntakeProtocol[] = cached ? JSON.parse(cached) : [];
    list.unshift(intake);
    localStorage.setItem(STORAGE_KEYS.INTAKES, JSON.stringify(list));
  } catch {
    // Ignore error
  }

  const client = supabaseClient();
  if (client && !missingTables.has('intake_protocols')) {
    try {
      const { error } = await client.from('intake_protocols').insert({
        id: intake.id,
        protocol_code: intake.protocolCode,
        client_name: intake.clientName,
        corporate_role: intake.corporateRole,
        group_name: intake.groupName,
        email: intake.email,
        court: intake.court,
        estimated_value: intake.estimatedValue,
        brief_summary: intake.briefSummary,
        status: intake.status,
        created_at: new Date().toISOString(),
      });
      if (error) {
        handleSupabaseError('intake_protocols', 'insert', error);
        return false;
      }
      return true;
    } catch (err) {
      handleSupabaseError('intake_protocols', 'insert', err);
      return false;
    }
  }
  return true;
}

export async function dbUpdateIntakeStatus(
  id: string,
  newStatus: 'Pendente' | 'Conflito Verificado' | 'Audiencia Confirmada',
  currentList: IntakeProtocol[]
): Promise<IntakeProtocol[]> {
  const updated = currentList.map((i) => (i.id === id ? { ...i, status: newStatus } : i));
  localStorage.setItem(STORAGE_KEYS.INTAKES, JSON.stringify(updated));

  const client = supabaseClient();
  if (client && !missingTables.has('intake_protocols')) {
    try {
      const { error } = await client
        .from('intake_protocols')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        handleSupabaseError('intake_protocols', 'update', error);
      }
    } catch (err) {
      handleSupabaseError('intake_protocols', 'update', err);
    }
  }
  return updated;
}

export async function dbDeleteIntake(id: string, currentList: IntakeProtocol[]): Promise<IntakeProtocol[]> {
  const filtered = currentList.filter((i) => i.id !== id);
  localStorage.setItem(STORAGE_KEYS.INTAKES, JSON.stringify(filtered));

  const client = supabaseClient();
  if (client && !missingTables.has('intake_protocols')) {
    try {
      const { error } = await client.from('intake_protocols').delete().eq('id', id);
      if (error) {
        handleSupabaseError('intake_protocols', 'delete', error);
      }
    } catch (err) {
      handleSupabaseError('intake_protocols', 'delete', err);
    }
  }
  return filtered;
}

// 3. Practice Areas
export async function dbFetchPractices(defaultPractices: PracticeArea[]): Promise<PracticeArea[]> {
  const client = supabaseClient();
  if (client && !missingTables.has('practice_areas')) {
    try {
      const { data, error } = await client.from('practice_areas').select('*');
      if (error) {
        handleSupabaseError('practice_areas', 'select', error);
      } else if (data?.length) {
        return data.map((p) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          description: p.description,
          leadership: p.leadership,
          iconName: p.icon_name || 'Building2',
          litigationProfile: p.litigation_profile || 'Contencioso Estratégico',
        }));
      }
    } catch (err) {
      handleSupabaseError('practice_areas', 'select', err);
    }
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEYS.PRACTICES);
    if (cached) return JSON.parse(cached);
  } catch {
    // Ignore error
  }
  return defaultPractices;
}

export async function dbInsertPractice(practice: PracticeArea, currentList: PracticeArea[]): Promise<PracticeArea[]> {
  const updated = [...currentList, practice];
  localStorage.setItem(STORAGE_KEYS.PRACTICES, JSON.stringify(updated));

  const client = supabaseClient();
  if (client && !missingTables.has('practice_areas')) {
    try {
      const { error } = await client.from('practice_areas').insert({
        id: practice.id,
        title: practice.title,
        category: practice.category,
        description: practice.description,
        leadership: practice.leadership,
        icon_name: practice.iconName,
        litigation_profile: practice.litigationProfile,
        created_at: new Date().toISOString(),
      });
      if (error) {
        handleSupabaseError('practice_areas', 'insert', error);
      }
    } catch (err) {
      handleSupabaseError('practice_areas', 'insert', err);
    }
  }
  return updated;
}

// 4. Law Review Articles
export async function dbFetchArticles(defaultArticles: LawReviewArticle[]): Promise<LawReviewArticle[]> {
  const client = supabaseClient();
  if (client && !missingTables.has('law_review_articles')) {
    try {
      const { data, error } = await client.from('law_review_articles').select('*');
      if (error) {
        handleSupabaseError('law_review_articles', 'select', error);
      } else if (data?.length) {
        return data.map((a) => ({
          id: a.id,
          title: a.title,
          category: a.category,
          categoryLabel: a.category_label,
          readTime: a.read_time,
          author: a.author,
          abstract: a.abstract,
          fullContent: a.full_content || [a.abstract],
          keyPrecedents: a.key_precedents || [],
        }));
      }
    } catch (err) {
      handleSupabaseError('law_review_articles', 'select', err);
    }
  }

  try {
    const cached = localStorage.getItem(STORAGE_KEYS.ARTICLES);
    if (cached) return JSON.parse(cached);
  } catch {
    // Ignore error
  }
  return defaultArticles;
}

export async function dbInsertArticle(article: LawReviewArticle, currentList: LawReviewArticle[]): Promise<LawReviewArticle[]> {
  const updated = [article, ...currentList];
  localStorage.setItem(STORAGE_KEYS.ARTICLES, JSON.stringify(updated));

  const client = supabaseClient();
  if (client && !missingTables.has('law_review_articles')) {
    try {
      const { error } = await client.from('law_review_articles').insert({
        id: article.id,
        title: article.title,
        category: article.category,
        category_label: article.categoryLabel,
        read_time: article.readTime,
        author: article.author,
        abstract: article.abstract,
        full_content: article.fullContent,
        key_precedents: article.keyPrecedents,
        created_at: new Date().toISOString(),
      });
      if (error) {
        handleSupabaseError('law_review_articles', 'insert', error);
      }
    } catch (err) {
      handleSupabaseError('law_review_articles', 'insert', err);
    }
  }
  return updated;
}

// 5. Newsletter Subscribers
export async function dbInsertSubscriber(email: string, area: string): Promise<boolean> {
  try {
    const cached = localStorage.getItem(STORAGE_KEYS.SUBSCRIBERS);
    const list = cached ? JSON.parse(cached) : [];
    list.push({ email, area, date: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEYS.SUBSCRIBERS, JSON.stringify(list));
  } catch {
    // Ignore error
  }

  const client = supabaseClient();
  if (client && !missingTables.has('newsletter_subscribers')) {
    try {
      const { error } = await client.from('newsletter_subscribers').insert({
        email,
        preference_area: area,
        created_at: new Date().toISOString(),
      });
      if (error) {
        handleSupabaseError('newsletter_subscribers', 'insert', error);
        return false;
      }
      return true;
    } catch (err) {
      handleSupabaseError('newsletter_subscribers', 'insert', err);
      return false;
    }
  }
  return true;
}
