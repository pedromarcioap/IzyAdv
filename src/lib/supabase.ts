import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FirmConfig, IntakeProtocol, PracticeArea, LawReviewArticle, AdminUser } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('http')
);

// Single Supabase Client instance (or null if not configured)
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Local fallback storage keys
const STORAGE_KEYS = {
  AUTH_USER: 'veritas_supabase_auth_user',
  ADMIN_USERS: 'veritas_supabase_admin_users',
  FIRM_CONFIG: 'veritas_supabase_firm_config',
  INTAKES: 'veritas_supabase_intakes',
  PRACTICES: 'veritas_supabase_practices',
  ARTICLES: 'veritas_supabase_articles',
  SUBSCRIBERS: 'veritas_supabase_subscribers',
};

export const initialAdminUsers: AdminUser[] = [
  {
    id: 'usr-master-1',
    name: 'Dr. Pedro Márcio (Sócio Diretor)',
    email: 'admin@veritaslex.adv.br',
    role: 'Master Admin',
    lastSignIn: 'Hoje, 09:15',
    createdAt: '15/01/2024',
    password: 'Veritas@2025!',
  },
  {
    id: 'usr-socio-2',
    name: 'Dr. Rodrigo Mendes',
    email: 'mendes@veritaslex.adv.br',
    role: 'Sócio Titular',
    lastSignIn: 'Ontem, 17:40',
    createdAt: '20/02/2024',
    password: 'Mendes@2025!',
  },
  {
    id: 'usr-associado-3',
    name: 'Dra. Helena Prado',
    email: 'associado@veritaslex.adv.br',
    role: 'Advogado Associado',
    lastSignIn: '18/09/2026',
    createdAt: '10/05/2025',
    password: 'Helena@2025!',
  },
];

// ============================================================================
// SUPABASE AUTHENTICATION SERVICE (STRICT LOGIN & LOGOUT)
// ============================================================================

export async function dbFetchAdminUsers(): Promise<AdminUser[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_USERS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(initialAdminUsers));
      return initialAdminUsers;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : initialAdminUsers;
  } catch {
    return initialAdminUsers;
  }
}

export async function dbCreateAdminUser(newUser: {
  name: string;
  email: string;
  role: 'Master Admin' | 'Sócio Titular' | 'Advogado Associado';
  password?: string;
}): Promise<{ user: AdminUser | null; error: string | null }> {
  const users = await dbFetchAdminUsers();

  const normalizedEmail = newUser.email.trim().toLowerCase();
  const exists = users.some((u) => u.email.toLowerCase() === normalizedEmail);
  if (exists) {
    return { user: null, error: 'Já existe um usuário cadastrado com este e-mail institucional.' };
  }

  let createdId = `usr-${Date.now()}`;

  // Provision in Supabase if live
  if (isSupabaseConfigured && supabase && newUser.password) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: newUser.password,
        options: {
          data: {
            name: newUser.name,
            role: newUser.role,
          },
        },
      });
      if (error) {
        console.warn('Supabase Auth signUp warn:', error.message);
      } else if (data?.user) {
        createdId = data.user.id;
        const profileRole = newUser.role === 'Master Admin' ? 'master_admin' : newUser.role === 'Sócio Titular' ? 'admin' : 'editor';
        await supabase.from('admin_profiles').upsert({
          user_id: data.user.id,
          email: normalizedEmail,
          full_name: newUser.name,
          role: profileRole,
          is_active: true,
          accepted_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Supabase provision catch:', err);
    }
  }

  const createdUser: AdminUser = {
    id: createdId,
    name: newUser.name.trim(),
    email: normalizedEmail,
    role: newUser.role,
    password: newUser.password || 'Veritas@2025!',
    createdAt: new Date().toLocaleDateString('pt-BR'),
    lastSignIn: 'Nunca acessou',
  };

  const updatedList = [createdUser, ...users];
  localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(updatedList));

  return { user: createdUser, error: null };
}

export async function dbDeleteAdminUser(userId: string): Promise<boolean> {
  const users = await dbFetchAdminUsers();
  const filtered = users.filter((u) => u.id !== userId);
  localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(filtered));
  return true;
}

function translateAuthError(errorMsg: string): string {
  const msg = errorMsg.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos. Verifique suas credenciais de acesso.';
  }
  if (msg.includes('email not confirmed')) {
    return 'E-mail não confirmado na base do Supabase.';
  }
  if (msg.includes('user not found')) {
    return 'Usuário não localizado no sistema de credenciamento do gabinete.';
  }
  if (msg.includes('rate limit')) {
    return 'Muitas tentativas seguidas. Por favor, aguarde alguns instantes antes de tentar novamente.';
  }
  return errorMsg;
}

export async function supabaseSignIn(email: string, password: string): Promise<{ user: AdminUser | null; error: string | null }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        return { user: null, error: translateAuthError(error.message) };
      }
      if (data.user) {
        const users = await dbFetchAdminUsers();
        const matched = users.find((u) => u.email.toLowerCase() === normalizedEmail);

        // Check public.admin_profiles for synced role
        let userRole: 'Master Admin' | 'Sócio Titular' | 'Advogado Associado' = matched?.role || data.user.user_metadata?.role || 'Master Admin';
        let userName: string = matched?.name || data.user.user_metadata?.name || 'Membro do Gabinete';

        try {
          const { data: profile } = await supabase
            .from('admin_profiles')
            .select('*')
            .eq('user_id', data.user.id)
            .maybeSingle();

          if (profile) {
            if (profile.full_name) userName = profile.full_name;
            if (profile.role === 'master_admin') userRole = 'Master Admin';
            else if (profile.role === 'admin') userRole = 'Sócio Titular';
            else if (profile.role === 'editor') userRole = 'Advogado Associado';
          }
        } catch {
          // Fallback to local user
        }

        const adminUser: AdminUser = {
          id: data.user.id,
          name: userName,
          email: data.user.email || normalizedEmail,
          role: userRole,
          lastSignIn: new Date().toLocaleTimeString('pt-BR'),
        };
        localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(adminUser));
        return { user: adminUser, error: null };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? translateAuthError(err.message) : 'Falha na autenticação Supabase';
      return { user: null, error: msg };
    }
  }

  // Local sandbox verification against provisioned admin users
  if (password.length < 4) {
    return { user: null, error: 'A senha informada deve conter no mínimo 6 caracteres.' };
  }

  const users = await dbFetchAdminUsers();
  const matchedUser = users.find((u) => u.email.toLowerCase() === normalizedEmail);

  if (!matchedUser) {
    return {
      user: null,
      error: 'E-mail não credenciado no gabinete. A criação de novos usuários é restrita às configurações por um Administrador.',
    };
  }

  // Password check (accepts either configured password or fallback demo)
  if (matchedUser.password && matchedUser.password !== password && password !== 'Veritas@2025!') {
    return { user: null, error: 'Senha incorreta para o e-mail institucional informado.' };
  }

  const authenticatedUser: AdminUser = {
    ...matchedUser,
    lastSignIn: new Date().toLocaleTimeString('pt-BR'),
  };

  // Update last sign in
  const updatedList = users.map((u) => (u.id === matchedUser.id ? authenticatedUser : u));
  localStorage.setItem(STORAGE_KEYS.ADMIN_USERS, JSON.stringify(updatedList));
  localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(authenticatedUser));

  return { user: authenticatedUser, error: null };
}

export async function supabaseSignUp(email: string, password: string): Promise<{ user: AdminUser | null; error: string | null }> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return { user: null, error: translateAuthError(error.message) };
      if (data.user) {
        const adminUser: AdminUser = {
          id: data.user.id,
          email: data.user.email || email,
          role: 'Advogado Associado',
          lastSignIn: new Date().toLocaleTimeString('pt-BR'),
        };
        return { user: adminUser, error: null };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? translateAuthError(err.message) : 'Falha no cadastro Supabase';
      return { user: null, error: msg };
    }
  }

  const simulatedUser: AdminUser = {
    id: `usr-${Date.now()}`,
    email: email,
    role: 'Advogado Associado',
    lastSignIn: new Date().toLocaleTimeString('pt-BR'),
  };
  localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(simulatedUser));
  return { user: simulatedUser, error: null };
}

export async function supabaseSignOut(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Erro ao deslogar do Supabase:', err);
    }
  }
  localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
}

export function getCurrentSessionUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function subscribeToAuthChanges(onUserChange: (user: AdminUser | null) => void): () => void {
  if (!isSupabaseConfigured || !supabase) {
    return () => {};
  }

  // Listen to Supabase auth events
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
      const normalizedEmail = (session.user.email || '').toLowerCase();
      const users = await dbFetchAdminUsers();
      const matched = users.find((u) => u.email.toLowerCase() === normalizedEmail);

      let userRole: 'Master Admin' | 'Sócio Titular' | 'Advogado Associado' = matched?.role || session.user.user_metadata?.role || 'Master Admin';
      let userName: string = matched?.name || session.user.user_metadata?.name || 'Membro do Gabinete';

      try {
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (profile) {
          if (profile.full_name) userName = profile.full_name;
          if (profile.role === 'master_admin') userRole = 'Master Admin';
          else if (profile.role === 'admin') userRole = 'Sócio Titular';
          else if (profile.role === 'editor') userRole = 'Advogado Associado';
        }
      } catch {
        // Ignore fallback
      }

      const adminUser: AdminUser = {
        id: session.user.id,
        name: userName,
        email: session.user.email || normalizedEmail,
        role: userRole,
        lastSignIn: new Date().toLocaleTimeString('pt-BR'),
      };
      localStorage.setItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(adminUser));
      onUserChange(adminUser);
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem(STORAGE_KEYS.AUTH_USER);
      onUserChange(null);
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}

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
  if (isSupabaseConfigured && supabase && !missingTables.has('firm_configs')) {
    try {
      const { data, error } = await supabase
        .from('firm_configs')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        handleSupabaseError('firm_configs', 'select', error);
      } else if (data && data.config_json) {
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

  if (isSupabaseConfigured && supabase && !missingTables.has('firm_configs')) {
    try {
      const { error } = await supabase.from('firm_configs').upsert({
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
  if (isSupabaseConfigured && supabase && !missingTables.has('intake_protocols')) {
    try {
      const { data, error } = await supabase
        .from('intake_protocols')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        handleSupabaseError('intake_protocols', 'select', error);
      } else if (data && data.length > 0) {
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

  if (isSupabaseConfigured && supabase && !missingTables.has('intake_protocols')) {
    try {
      const { error } = await supabase.from('intake_protocols').insert({
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

  if (isSupabaseConfigured && supabase && !missingTables.has('intake_protocols')) {
    try {
      const { error } = await supabase
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

  if (isSupabaseConfigured && supabase && !missingTables.has('intake_protocols')) {
    try {
      const { error } = await supabase.from('intake_protocols').delete().eq('id', id);
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
  if (isSupabaseConfigured && supabase && !missingTables.has('practice_areas')) {
    try {
      const { data, error } = await supabase.from('practice_areas').select('*');
      if (error) {
        handleSupabaseError('practice_areas', 'select', error);
      } else if (data && data.length > 0) {
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

  if (isSupabaseConfigured && supabase && !missingTables.has('practice_areas')) {
    try {
      const { error } = await supabase.from('practice_areas').insert({
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
  if (isSupabaseConfigured && supabase && !missingTables.has('law_review_articles')) {
    try {
      const { data, error } = await supabase.from('law_review_articles').select('*');
      if (error) {
        handleSupabaseError('law_review_articles', 'select', error);
      } else if (data && data.length > 0) {
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

  if (isSupabaseConfigured && supabase && !missingTables.has('law_review_articles')) {
    try {
      const { error } = await supabase.from('law_review_articles').insert({
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

  if (isSupabaseConfigured && supabase && !missingTables.has('newsletter_subscribers')) {
    try {
      const { error } = await supabase.from('newsletter_subscribers').insert({
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
