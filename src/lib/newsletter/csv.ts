/**
 * CSV import/export for the subscriber base.
 *
 * Pure functions with no Supabase dependency, so they are directly unit
 * testable — the parsing rules below are exactly the kind of thing that
 * silently corrupts data if left untested.
 *
 * RFC 4180 handling:
 *   - quoted fields may contain the delimiter, quotes and newlines
 *   - a doubled quote inside a quoted field is a literal quote
 *   - `\r\n` and `\n` are both accepted as record separators
 */

export interface CsvParseResult {
    headers: string[];
    rows: string[][];
    errors: string[];
}

export function parseCsv(input: string, delimiter = ','): CsvParseResult {
    const errors: string[] = [];
    const rows: string[][] = [];

    // Strip a UTF-8 BOM, which Excel writes and which would corrupt the first header.
    const text = input.replace(/^\uFEFF/, '');

    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let index = 0;

    const pushField = () => {
        row.push(field);
        field = '';
    };

    const pushRow = () => {
        // Skip completely empty trailing lines.
        if (row.length === 1 && row[0] === '') {
            row = [];
            return;
        }
        rows.push(row);
        row = [];
    };

    while (index < text.length) {
        const char = text[index];

        if (inQuotes) {
            if (char === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                inQuotes = false;
                index += 1;
                continue;
            }
            field += char;
            index += 1;
            continue;
        }

        if (char === '"' && field === '') {
            inQuotes = true;
            index += 1;
            continue;
        }

        if (char === delimiter) {
            pushField();
            index += 1;
            continue;
        }

        if (char === '\r') {
            index += 1;
            continue;
        }

        if (char === '\n') {
            pushField();
            pushRow();
            index += 1;
            continue;
        }

        field += char;
        index += 1;
    }

    if (inQuotes) {
        errors.push('aspas não fechadas no final do arquivo');
    }

    pushField();
    pushRow();

    if (rows.length === 0) {
        return { headers: [], rows: [], errors: [...errors, 'arquivo vazio'] };
    }

    const headers = rows[0].map((header) => header.trim().toLowerCase());
    const dataRows = rows.slice(1);

    const width = headers.length;
    dataRows.forEach((dataRow, rowIndex) => {
        if (dataRow.length !== width) {
            errors.push(
                `linha ${rowIndex + 2}: esperado(s) ${width} campo(s), encontrado(s) ${dataRow.length}`,
            );
        }
    });

    return { headers, rows: dataRows, errors };
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
    const escape = (value: string | number | null | undefined): string => {
        const text = value === null || value === undefined ? '' : String(value);
        // Quote when the value could otherwise be misread.
        if (/[",\n\r;]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    };

    return [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\r\n');
}

export interface MappedSubscriberRow {
    email: string;
    name?: string | null;
    company?: string | null;
    job_title?: string | null;
    preference_area?: string | null;
    phone?: string | null;
}

export interface ImportRowResult {
    row: number;
    email: string;
    status: 'valid' | 'invalid' | 'duplicate';
    reason?: string;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Column aliases accepted on import, so operators do not need an exact template. */
const COLUMN_ALIASES: Record<string, keyof MappedSubscriberRow> = {
    email: 'email',
    'e-mail': 'email',
    'e mail': 'email',
    correio: 'email',
    nome: 'name',
    name: 'name',
    'nome completo': 'name',
    empresa: 'company',
    company: 'company',
    organizacao: 'company',
    'organização': 'company',
    cargo: 'job_title',
    'job title': 'job_title',
    cargo_titulo: 'job_title',
    area: 'preference_area',
    'área': 'preference_area',
    interesse: 'preference_area',
    'preference area': 'preference_area',
    telefone: 'phone',
    phone: 'phone',
};

export interface ImportPreview {
    mapped: (MappedSubscriberRow & { __row: number })[];
    results: ImportRowResult[];
    validCount: number;
    invalidCount: number;
    duplicateInFileCount: number;
    unmappedColumns: string[];
}

/**
 * Maps parsed CSV rows onto subscriber fields.
 * Duplicates inside the file itself are detected here (case-insensitive),
 * before any database round trip.
 */
export function mapImportRows(parsed: CsvParseResult, maxRows = 5000): ImportPreview {
    const columnMap = new Map<number, keyof MappedSubscriberRow>();
    const unmappedColumns: string[] = [];

    parsed.headers.forEach((header, position) => {
        const key = COLUMN_ALIASES[header];
        if (key) columnMap.set(position, key);
        else unmappedColumns.push(header);
    });

    const results: ImportRowResult[] = [];
    const mapped: (MappedSubscriberRow & { __row: number })[] = [];
    const seen = new Set<string>();

    if (![...columnMap.values()].includes('email')) {
        return {
            mapped: [],
            results: [
                {
                    row: 0,
                    email: '',
                    status: 'invalid',
                    reason: 'não foi encontrada uma coluna de e-mail (email, e-mail, ...)',
                },
            ],
            validCount: 0,
            invalidCount: 1,
            duplicateInFileCount: 0,
            unmappedColumns,
        };
    }

    parsed.rows.slice(0, maxRows).forEach((row, rowIndex) => {
        // Accumulate as a plain string map, then materialise the typed record.
        const record: Record<string, string> = { email: '' };

        columnMap.forEach((field, position) => {
            const raw = (row[position] ?? '').trim();
            if (!raw) return;

            record[field] = field === 'email' ? raw.toLowerCase() : raw;
        });

        const lineNumber = rowIndex + 2;
        const email = record.email ?? '';

        if (!email) {
            results.push({ row: lineNumber, email: '', status: 'invalid', reason: 'e-mail vazio' });
            return;
        }

        if (!EMAIL_PATTERN.test(email)) {
            results.push({ row: lineNumber, email, status: 'invalid', reason: 'formato de e-mail inválido' });
            return;
        }

        if (seen.has(email)) {
            results.push({
                row: lineNumber,
                email,
                status: 'duplicate',
                reason: 'e-mail repetido dentro do próprio arquivo',
            });
            return;
        }

        seen.add(email);
        results.push({ row: lineNumber, email, status: 'valid' });
        mapped.push({
            email,
            name: record.name ?? null,
            company: record.company ?? null,
            job_title: record.job_title ?? null,
            preference_area: record.preference_area ?? null,
            phone: record.phone ?? null,
            __row: lineNumber,
        });
    });

    return {
        mapped,
        results,
        validCount: results.filter((result) => result.status === 'valid').length,
        invalidCount: results.filter((result) => result.status === 'invalid').length,
        duplicateInFileCount: results.filter((result) => result.status === 'duplicate').length,
        unmappedColumns,
    };
}

/** Triggers a browser download without needing a server round trip. */
export function downloadCsv(filename: string, content: string): void {
    // Prefix with a BOM so Excel opens UTF-8 accents correctly.
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    URL.revokeObjectURL(url);
}
