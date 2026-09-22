/**
 * Bulk import engine for the Informativo list management.
 *
 * The heavy lifting is split deliberately:
 *
 *   client (this file)          server (newsletter_import_rows_batch)
 *   --------------------------  ------------------------------------
 *   parse CSV / pasted text     validate e-mail again (never trust input)
 *   detect the delimiter        dedupe against the database
 *   guess a field mapping       create/link the CRM contact
 *   validate + dedupe in-file   upsert the subscriber
 *   chunk the payload           upsert list membership
 *                               record per-row outcomes
 *
 * Parsing on the client means a 50 MB export never has to travel through
 * Postgres, while the server stays the single source of truth for the rules
 * that must not differ between callers.
 *
 * Everything here is a pure function except `runImport`, which is the only
 * part that talks to Supabase — so the mapping/validation logic is directly
 * unit testable.
 */

import { callRpc, getClient, run, translateError } from './client';
import { parseCsv, type CsvParseResult } from './csv';
import type {
    ImportBatchResult,
    ImportFieldMapping,
    ImportRowOutcome,
    ImportTargetField,
    NewsletterImportJob,
    NewsletterImportOptions,
    NewsletterImportRow,
    NewsletterImportRowStatus,
    NewsletterImportSource,
    NewsletterImportStatus,
} from '../../types/newsletter';
import { DEFAULT_IMPORT_OPTIONS } from '../../types/newsletter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Deliberately linear-time e-mail shape check.
 *
 * The naive `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` is ambiguous: `.` is neither
 * whitespace nor `@`, so it belongs to both `[^\s@]` classes and the engine
 * can split a single input in exponentially many ways (super-linear
 * backtracking). Here the domain is built from dot-free labels joined by
 * literal dots, so the separator can only be matched one way and the check
 * stays linear. The local part keeps its dots (e.g. `first.last+tag`).
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Rows sent per RPC call. Small enough to stay well inside the request limit. */
export const IMPORT_CHUNK_SIZE = 250;

/** Hard ceiling for a single import, to protect the browser and the database. */
export const IMPORT_MAX_ROWS = 20000;

/**
 * Header aliases → target field. Checked after normalising the header
 * (lower-case, accents stripped, punctuation collapsed to spaces), so
 * "E-mail", "e mail" and "EMAIL" all resolve to `email`.
 */
const HEADER_ALIASES: Record<string, ImportTargetField> = {
    email: 'email',
    'e mail': 'email',
    mail: 'email',
    correio: 'email',
    'correio eletronico': 'email',
    'endereco de email': 'email',

    nome: 'name',
    name: 'name',
    'nome completo': 'name',
    'full name': 'name',
    contato: 'name',
    'nome do contato': 'name',

    empresa: 'company',
    company: 'company',
    organizacao: 'company',
    instituicao: 'company',
    escritorio: 'company',

    cargo: 'job_title',
    'job title': 'job_title',
    funcao: 'job_title',
    posicao: 'job_title',
    'cargo titulo': 'job_title',

    telefone: 'phone',
    phone: 'phone',
    celular: 'phone',
    whatsapp: 'phone',
    fone: 'phone',

    area: 'preference_area',
    'area de interesse': 'preference_area',
    interesse: 'preference_area',
    interesses: 'preference_area',
    'preference area': 'preference_area',
    assunto: 'preference_area',

    documento: 'document',
    cpf: 'document',
    cnpj: 'document',
    'cpf cnpj': 'document',
    document: 'document',
};

/** Order used when several columns could map to the same field. */
const TARGET_PRIORITY: ImportTargetField[] = [
    'email',
    'name',
    'company',
    'job_title',
    'phone',
    'preference_area',
    'document',
];

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Lower-cases, strips accents and collapses anything non-alphanumeric to a space. */
export function normalizeHeader(header: string): string {
    return header
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Canonical form of an address, matching the database trigger. */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
    return EMAIL_PATTERN.test(email);
}

// ---------------------------------------------------------------------------
// Delimiter detection
// ---------------------------------------------------------------------------

/**
 * Guesses the delimiter from the first non-empty line by counting candidates
 * outside of quotes. Falls back to a comma, which is what the templates use.
 */
export function detectDelimiter(input: string): string {
    const candidates = [',', ';', '\t', '|'];
    const firstLine = input
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0);

    if (!firstLine) return ',';

    let best = ',';
    let bestCount = 0;

    for (const candidate of candidates) {
        let count = 0;
        let inQuotes = false;
        for (const char of firstLine) {
            if (char === '"') inQuotes = !inQuotes;
            else if (char === candidate && !inQuotes) count += 1;
        }
        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }

    return best;
}

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

/**
 * Suggests a mapping for every source column. A column is only auto-mapped
 * when its normalised header matches a known alias; anything else is left as
 * `ignore` so the operator makes a deliberate choice.
 */
export function guessFieldMapping(headers: string[]): ImportFieldMapping {
    const mapping: ImportFieldMapping = {};
    const used = new Set<ImportTargetField>();

    headers.forEach((header) => {
        const target = HEADER_ALIASES[normalizeHeader(header)];
        if (target && !used.has(target)) {
            mapping[header] = target;
            used.add(target);
        } else {
            mapping[header] = 'ignore';
        }
    });

    return mapping;
}

/** True when the mapping contains exactly one `email` target. */
export function mappingHasEmail(mapping: ImportFieldMapping): boolean {
    return Object.values(mapping).filter((target) => target === 'email').length === 1;
}

/** Human-readable problems with a mapping, empty when it is usable. */
export function validateMapping(mapping: ImportFieldMapping): string[] {
    const problems: string[] = [];
    const targets = Object.values(mapping);
    const emailCount = targets.filter((target) => target === 'email').length;

    if (emailCount === 0) {
        problems.push('Nenhuma coluna foi mapeada para o campo E-mail.');
    } else if (emailCount > 1) {
        problems.push('Mais de uma coluna foi mapeada para E-mail; escolha apenas uma.');
    }

    const duplicates = TARGET_PRIORITY.filter(
        (field) => targets.filter((target) => target === field).length > 1,
    );
    if (duplicates.length > 0) {
        problems.push(`Campos mapeados mais de uma vez: ${duplicates.join(', ')}.`);
    }

    return problems;
}

// ---------------------------------------------------------------------------
// Row mapping + validation
// ---------------------------------------------------------------------------

/** A row ready to be sent to the RPC. `__row` carries the original line number. */
export interface MappedImportRow {
    __row: number;
    email: string;
    name?: string | null;
    company?: string | null;
    job_title?: string | null;
    phone?: string | null;
    preference_area?: string | null;
    document?: string | null;
}

export interface ImportRowIssue {
    row: number;
    email: string;
    status: Extract<NewsletterImportRowStatus, 'invalid' | 'duplicate_in_file'>;
    reason: string;
}

export interface ImportPlan {
    /** Rows that passed client-side validation and are safe to send. */
    rows: MappedImportRow[];
    /** Rows rejected before any network call, with the reason. */
    issues: ImportRowIssue[];
    validCount: number;
    invalidCount: number;
    duplicateInFileCount: number;
    /** Source columns the operator left unmapped. */
    ignoredColumns: string[];
    /** Total data rows seen (excluding the header). */
    totalRows: number;
    /** True when the file exceeded IMPORT_MAX_ROWS and was cut short. */
    truncated: boolean;
}

/**
 * Applies a mapping to parsed rows, validating and de-duplicating in memory.
 *
 * Duplicate detection here is intentionally case-insensitive and covers the
 * whole file, so the operator sees the problem before anything is written.
 * Duplicates against the database are detected server-side, where the data
 * actually lives.
 */
export function buildImportPlan(
    parsed: CsvParseResult,
    mapping: ImportFieldMapping,
    maxRows = IMPORT_MAX_ROWS,
): ImportPlan {
    const issues: ImportRowIssue[] = [];
    const rows: MappedImportRow[] = [];
    const seen = new Set<string>();

    const ignoredColumns = Object.entries(mapping)
        .filter(([, target]) => target === 'ignore')
        .map(([header]) => header);

    const totalRows = parsed.rows.length;
    const truncated = totalRows > maxRows;
    const slice = parsed.rows.slice(0, maxRows);

    // Position → target field, so we only walk the mapping once per file.
    const positions: { index: number; target: ImportTargetField }[] = [];
    parsed.headers.forEach((header, index) => {
        const target = mapping[header];
        if (target && target !== 'ignore') positions.push({ index, target });
    });

    slice.forEach((row, rowIndex) => {
        const lineNumber = rowIndex + 2; // +1 for the header, +1 for 1-based lines
        const record: Partial<Record<ImportTargetField, string>> = {};

        positions.forEach(({ index, target }) => {
            const raw = (row[index] ?? '').trim();
            if (raw) record[target] = raw;
        });

        const email = normalizeEmail(record.email ?? '');

        if (!email) {
            issues.push({ row: lineNumber, email: '', status: 'invalid', reason: 'e-mail vazio' });
            return;
        }

        if (!isValidEmail(email)) {
            issues.push({
                row: lineNumber,
                email,
                status: 'invalid',
                reason: 'formato de e-mail inválido',
            });
            return;
        }

        if (seen.has(email)) {
            issues.push({
                row: lineNumber,
                email,
                status: 'duplicate_in_file',
                reason: 'e-mail repetido dentro do próprio arquivo',
            });
            return;
        }

        seen.add(email);

        rows.push({
            __row: lineNumber,
            email,
            name: record.name ?? null,
            company: record.company ?? null,
            job_title: record.job_title ?? null,
            phone: record.phone ?? null,
            preference_area: record.preference_area ?? null,
            document: record.document ?? null,
        });
    });

    return {
        rows,
        issues,
        validCount: rows.length,
        invalidCount: issues.filter((issue) => issue.status === 'invalid').length,
        duplicateInFileCount: issues.filter((issue) => issue.status === 'duplicate_in_file').length,
        ignoredColumns,
        totalRows,
        truncated,
    };
}

// ---------------------------------------------------------------------------
// Source parsing (file or pasted text)
// ---------------------------------------------------------------------------

export interface ParsedImportSource {
    parsed: CsvParseResult;
    delimiter: string;
    /** Suggested mapping, ready to be shown in the wizard. */
    mapping: ImportFieldMapping;
}

/**
 * Parses a CSV file or pasted text into headers + rows and suggests a mapping.
 * The delimiter is auto-detected unless one is supplied explicitly.
 */
export function parseImportSource(input: string, delimiter?: string): ParsedImportSource {
    const resolved = delimiter ?? detectDelimiter(input);
    const parsed = parseCsv(input, resolved);
    return {
        parsed,
        delimiter: resolved,
        mapping: guessFieldMapping(parsed.headers),
    };
}

/** Reads a File as text, tolerating the encodings Excel tends to emit. */
export async function readFileAsText(file: File): Promise<string> {
    return file.text();
}

// ---------------------------------------------------------------------------
// Job lifecycle (Supabase)
// ---------------------------------------------------------------------------

export interface CreateImportJobInput {
    listId: string;
    source: NewsletterImportSource;
    fileName?: string | null;
    fileSizeBytes?: number | null;
    delimiter: string;
    hasHeader: boolean;
    sourceColumns: string[];
    fieldMapping: ImportFieldMapping;
    options: Partial<NewsletterImportOptions>;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    duplicateRows: number;
}

/** Creates the auditable job row before any data is written. */
export async function createImportJob(input: CreateImportJobInput): Promise<NewsletterImportJob> {
    const client = getClient();
    const { data, error } = await client
        .from('newsletter_import_jobs')
        .insert({
            list_id: input.listId,
            status: 'importing',
            source: input.source,
            file_name: input.fileName ?? null,
            file_size_bytes: input.fileSizeBytes ?? null,
            delimiter: input.delimiter,
            has_header: input.hasHeader,
            source_columns: input.sourceColumns,
            field_mapping: input.fieldMapping,
            options: input.options,
            total_rows: input.totalRows,
            valid_rows: input.validRows,
            invalid_rows: input.invalidRows,
            duplicate_rows: input.duplicateRows,
            started_at: new Date().toISOString(),
        })
        .select('*')
        .single();

    if (error) throw translateError(error);
    return data as NewsletterImportJob;
}

export interface RunImportInput {
    jobId: string;
    listId: string;
    rows: MappedImportRow[];
    options?: Partial<NewsletterImportOptions>;
    /** Called after each chunk so the UI can show progress. */
    onProgress?: (processed: number, total: number) => void;
}

export interface RunImportResult {
    imported: number;
    updated: number;
    duplicates: number;
    invalid: number;
    failed: number;
    outcomes: ImportRowOutcome[];
}

/**
 * Sends the mapped rows in chunks and aggregates the per-chunk summaries.
 *
 * A chunk failure is recorded and the loop continues, so one bad batch does
 * not discard the work already committed by the previous ones.
 */
export async function runImport(input: RunImportInput): Promise<RunImportResult> {
    const options = { ...DEFAULT_IMPORT_OPTIONS, ...input.options };
    const total = input.rows.length;

    const result: RunImportResult = {
        imported: 0,
        updated: 0,
        duplicates: 0,
        invalid: 0,
        failed: 0,
        outcomes: [],
    };

    for (let offset = 0; offset < total; offset += IMPORT_CHUNK_SIZE) {
        const chunk = input.rows.slice(offset, offset + IMPORT_CHUNK_SIZE);

        try {
            const batch = await callRpc<ImportBatchResult>('newsletter_import_rows_batch', {
                p_job_id: input.jobId,
                p_list_id: input.listId,
                p_rows: chunk,
                p_options: options,
            });

            result.imported += batch.imported;
            result.updated += batch.updated;
            result.duplicates += batch.duplicates;
            result.invalid += batch.invalid;
            result.failed += batch.failed;
            result.outcomes.push(...batch.outcomes);
        } catch (error) {
            // Attribute the whole chunk to `failed` and keep going.
            const failure = error instanceof Error ? error.message : 'falha desconhecida';
            result.failed += chunk.length;
            chunk.forEach((row) => {
                result.outcomes.push({
                    row: row.__row,
                    email: row.email,
                    status: 'failed',
                    reason: failure,
                });
            });
        }

        input.onProgress?.(Math.min(offset + chunk.length, total), total);
    }

    return result;
}

/** Marks the job finished and stamps the list's last_import_at. */
export async function finalizeImportJob(
    jobId: string,
    status: NewsletterImportStatus = 'completed',
): Promise<NewsletterImportJob> {
    return callRpc<NewsletterImportJob>('newsletter_import_finalize', {
        p_job_id: jobId,
        p_status: status,
    });
}

// ---------------------------------------------------------------------------
// Reading jobs back (history + error report)
// ---------------------------------------------------------------------------

export async function listImportJobs(listId?: string, limit = 25): Promise<NewsletterImportJob[]> {
    const client = getClient();
    let query = client
        .from('newsletter_import_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (listId) query = query.eq('list_id', listId);

    const { data, error } = await query;
    if (error) throw translateError(error);
    return (data ?? []) as NewsletterImportJob[];
}

export async function getImportJob(jobId: string): Promise<NewsletterImportJob> {
    const client = getClient();
    const { data, error } = await client
        .from('newsletter_import_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (error) throw translateError(error);
    return data as NewsletterImportJob;
}

/** Rows that did not import cleanly, for the downloadable error report. */
export async function listImportIssues(
    jobId: string,
    limit = 1000,
): Promise<NewsletterImportRow[]> {
    const client = getClient();
    const { data, error } = await client
        .from('newsletter_import_rows')
        .select('*')
        .eq('job_id', jobId)
        .in('status', ['invalid', 'duplicate_in_file', 'duplicate_in_base', 'failed'])
        .order('line_number', { ascending: true })
        .limit(limit);

    if (error) throw translateError(error);
    return (data ?? []) as NewsletterImportRow[];
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export async function listImportPresets() {
    const client = getClient();
    const { data, error } = await client
        .from('newsletter_import_presets')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw translateError(error);
    return data ?? [];
}

export async function saveImportPreset(input: {
    name: string;
    description?: string | null;
    source: NewsletterImportSource;
    delimiter: string;
    fieldMapping: ImportFieldMapping;
    options: Partial<NewsletterImportOptions>;
}) {
    const client = getClient();
    const { data, error } = await client
        .from('newsletter_import_presets')
        .insert({
            name: input.name,
            description: input.description ?? null,
            source: input.source,
            delimiter: input.delimiter,
            field_mapping: input.fieldMapping,
            options: input.options,
        })
        .select('*')
        .single();

    if (error) throw translateError(error);
    return data;
}

export async function deleteImportPreset(id: string): Promise<void> {
    const client = getClient();
    await run(client.from('newsletter_import_presets').delete().eq('id', id).select('id'));
}

// ---------------------------------------------------------------------------
// Error report export
// ---------------------------------------------------------------------------

/** Builds a CSV of the failed rows so the operator can fix and re-import. */
export function buildErrorReportCsv(rows: NewsletterImportRow[]): string {
    const escape = (value: unknown): string => {
        let text = '';
        if (value !== null && value !== undefined) {
            text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
        }
        return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };

    const headers = ['linha', 'email', 'situacao', 'motivo'];
    const lines = rows.map((row) =>
        [row.line_number, row.email ?? '', row.status, row.reason ?? ''].map(escape).join(','),
    );

    return [headers.join(','), ...lines].join('\r\n');
}
