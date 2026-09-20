/**
 * Shared plumbing for every newsletter data-access module.
 *
 * Two rules are enforced here:
 *   1. A missing Supabase configuration produces a clear, actionable error
 *      instead of a null-pointer crash deep inside a component.
 *   2. Postgres errors are translated into messages an operator can act on.
 *      RLS denials in particular must not surface as "permission denied for
 *      table X", which reads like a bug rather than a permissions problem.
 */

import { supabase } from '../supabase';

export class NewsletterError extends Error {
    constructor(
        message: string,
        readonly code?: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'NewsletterError';
    }
}

export function getClient() {
    if (!supabase) {
        throw new NewsletterError(
            'Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.',
        );
    }
    return supabase;
}

interface PostgrestLikeError {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
}

/**
 * Maps known Postgres/PostgREST error codes to operator-facing Portuguese.
 * Anything unrecognised keeps the original message so nothing is hidden.
 */
export function translateError(error: PostgrestLikeError): NewsletterError {
    switch (error.code) {
        case '42501':
            return new NewsletterError(
                'Seu perfil não tem permissão para esta operação. Solicite acesso a um administrador.',
                error.code,
                error.details,
            );
        case '23505':
            return new NewsletterError('Já existe um registro com este valor único.', error.code, error.details);
        case '23503':
            return new NewsletterError(
                'Este registro está vinculado a outros dados e não pode ser removido.',
                error.code,
                error.details,
            );
        case '23514':
        case '22023':
            return new NewsletterError(
                'Os dados informados não passaram na validação do banco de dados.',
                error.code,
                error.details ?? error.message,
            );
        case 'P0002':
            return new NewsletterError('Registro não encontrado.', error.code, error.details);
        case '0A000':
            return new NewsletterError(
                'Recurso não disponível neste projeto (extensão ausente no banco de dados).',
                error.code,
                error.details,
            );
        default:
            return new NewsletterError(error.message, error.code, error.details);
    }
}

/** Runs a PostgREST query and unwraps the { data, error } contract. */
export async function run<T>(
    builder: PromiseLike<{ data: T | null; error: PostgrestLikeError | null }>,
): Promise<T> {
    const { data, error } = await builder;
    if (error) throw translateError(error);
    return data as T;
}

/** Runs an RPC and unwraps the { data, error } contract. */
export async function callRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const client = getClient();
    const { data, error } = await client.rpc(name, args);
    if (error) throw translateError(error);
    return data as T;
}

export interface PageRequest {
    page: number;
    pageSize: number;
    search?: string;
    status?: string | null;
    source?: string | null;
    tagId?: string | null;
    listId?: string | null;
    sortBy?: string;
    sortAscending?: boolean;
}

export interface PageResult<T> {
    rows: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

/** Escapes a value for use inside a PostgREST `or=(...)` filter. */
export function escapeFilterValue(value: string): string {
    return value.replace(/[,()\\]/g, (match) => `\\${match}`).replace(/\*/g, '');
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toFixed(digits).replace('.', ',')}%`;
}

export function formatInteger(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatCurrencyFromCents(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

/** `to`-ISO for an inclusive local date range, safe for timestamptz comparisons. */
export function endOfDayIso(date: string): string {
    const parsed = new Date(`${date}T23:59:59.999`);
    return parsed.toISOString();
}

export function startOfDayIso(date: string): string {
    const parsed = new Date(`${date}T00:00:00.000`);
    return parsed.toISOString();
}

export function toDateInputValue(date: Date): string {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function daysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return toDateInputValue(date);
}

export function today(): string {
    return toDateInputValue(new Date());
}
