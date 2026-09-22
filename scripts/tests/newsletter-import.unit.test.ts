/**
 * Newsletter bulk-import unit tests — no browser, no network, no test framework.
 *
 *   npm run test:import
 *
 * Only the pure half of `src/lib/newsletter/import.ts` is exercised here:
 * header normalisation, delimiter detection, field-mapping suggestion,
 * mapping validation, in-file validation/dedupe and the error-report export.
 *
 * The Supabase half (`runImport`, `createImportJob`, …) is deliberately not
 * mocked: a fake client would prove nothing about the RPCs and RLS policies
 * that actually enforce the rules. Those are covered at the database level by
 * supabase/tests/newsletter_verification.sql.
 */

import assert from 'node:assert/strict';
import {
    IMPORT_MAX_ROWS,
    buildErrorReportCsv,
    buildImportPlan,
    detectDelimiter,
    guessFieldMapping,
    isValidEmail,
    mappingHasEmail,
    normalizeEmail,
    normalizeHeader,
    parseImportSource,
    validateMapping,
} from '../../src/lib/newsletter/import';
import { parseCsv } from '../../src/lib/newsletter/csv';
import type { ImportFieldMapping, NewsletterImportRow } from '../../src/types/newsletter';

type TestFn = () => void | Promise<void>;

const tests: { name: string; fn: TestFn }[] = [];

function test(name: string, fn: TestFn): void {
    tests.push({ name, fn });
}

function section(name: string): void {
    console.log(`\n${name}`);
}

// ---------------------------------------------------------------------------
// normalizeHeader
// ---------------------------------------------------------------------------

section('normalizeHeader');

test('lower-cases and trims', () => {
    assert.equal(normalizeHeader('  EMAIL  '), 'email');
});

test('strips accents', () => {
    assert.equal(normalizeHeader('Endereço'), 'endereco');
    assert.equal(normalizeHeader('Área de Interesse'), 'area de interesse');
});

test('collapses punctuation and symbols to single spaces', () => {
    assert.equal(normalizeHeader('E-mail'), 'e mail');
    assert.equal(normalizeHeader('nome_completo'), 'nome completo');
    assert.equal(normalizeHeader('CPF/CNPJ'), 'cpf cnpj');
    assert.equal(normalizeHeader('job---title'), 'job title');
});

test('returns an empty string for blank input', () => {
    assert.equal(normalizeHeader('   '), '');
    assert.equal(normalizeHeader('---'), '');
});

// ---------------------------------------------------------------------------
// normalizeEmail / isValidEmail
// ---------------------------------------------------------------------------

section('normalizeEmail / isValidEmail');

test('normalizeEmail trims and lower-cases', () => {
    assert.equal(normalizeEmail('  Foo.Bar@Example.COM '), 'foo.bar@example.com');
});

test('isValidEmail accepts ordinary addresses', () => {
    assert.equal(isValidEmail('a@b.co'), true);
    assert.equal(isValidEmail('first.last+tag@sub.domain.com'), true);
});

test('isValidEmail rejects malformed addresses', () => {
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail('no-at-sign'), false);
    assert.equal(isValidEmail('missing@tld'), false);
    assert.equal(isValidEmail('two@@at.com'), false);
    assert.equal(isValidEmail('spaces in@email.com'), false);
});

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------

section('detectDelimiter');

test('detects a comma', () => {
    assert.equal(detectDelimiter('email,name\na@b.co,Ana'), ',');
});

test('detects a semicolon (common in pt-BR Excel exports)', () => {
    assert.equal(detectDelimiter('email;nome\na@b.co;Ana'), ';');
});

test('detects a tab', () => {
    assert.equal(detectDelimiter('email\tnome\na@b.co\tAna'), '\t');
});

test('detects a pipe', () => {
    assert.equal(detectDelimiter('email|nome\na@b.co|Ana'), '|');
});

test('ignores delimiters inside quoted values', () => {
    // The semicolons live inside a quoted field, so the comma must win.
    assert.equal(detectDelimiter('"a;b;c;d",name\na@b.co,Ana'), ',');
});

test('skips a leading BOM and blank lines', () => {
    assert.equal(detectDelimiter('\uFEFF\n\nemail;nome\na@b.co;Ana'), ';');
});

test('falls back to a comma when there is nothing to inspect', () => {
    assert.equal(detectDelimiter(''), ',');
    assert.equal(detectDelimiter('single-column'), ',');
});

// ---------------------------------------------------------------------------
// guessFieldMapping
// ---------------------------------------------------------------------------

section('guessFieldMapping');

test('maps known Portuguese headers', () => {
    const mapping = guessFieldMapping(['E-mail', 'Nome', 'Empresa', 'Cargo', 'Telefone']);
    assert.deepEqual(mapping, {
        'E-mail': 'email',
        Nome: 'name',
        Empresa: 'company',
        Cargo: 'job_title',
        Telefone: 'phone',
    });
});

test('maps known English headers', () => {
    const mapping = guessFieldMapping(['Email', 'Full Name', 'Company', 'Job Title', 'Phone']);
    assert.deepEqual(mapping, {
        Email: 'email',
        'Full Name': 'name',
        Company: 'company',
        'Job Title': 'job_title',
        Phone: 'phone',
    });
});

test('leaves unknown headers as ignore', () => {
    const mapping = guessFieldMapping(['Email', 'Observações', 'utm_source']);
    assert.equal(mapping.Email, 'email');
    assert.equal(mapping['Observações'], 'ignore');
    assert.equal(mapping.utm_source, 'ignore');
});

test('never maps the same target twice', () => {
    // Both columns normalise to `email`; only the first may claim the target.
    const mapping = guessFieldMapping(['Email', 'E-mail']);
    assert.equal(mapping.Email, 'email');
    assert.equal(mapping['E-mail'], 'ignore');
});

test('maps the document aliases', () => {
    const mapping = guessFieldMapping(['CPF/CNPJ']);
    assert.equal(mapping['CPF/CNPJ'], 'document');
});

// ---------------------------------------------------------------------------
// mappingHasEmail / validateMapping
// ---------------------------------------------------------------------------

section('mappingHasEmail / validateMapping');

test('mappingHasEmail is true only for exactly one email column', () => {
    assert.equal(mappingHasEmail({ Email: 'email', Nome: 'name' }), true);
    assert.equal(mappingHasEmail({ Nome: 'name' }), false);
    assert.equal(mappingHasEmail({ A: 'email', B: 'email' }), false);
});

test('validateMapping reports a missing email column', () => {
    const problems = validateMapping({ Nome: 'name' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /E-mail/);
});

test('validateMapping reports duplicate email columns', () => {
    // Two problems: "more than one email" plus the generic duplicate-target note.
    const problems = validateMapping({ A: 'email', B: 'email' });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /Mais de uma coluna/);
    assert.match(problems[1], /email/);
});

test('validateMapping reports other duplicated targets', () => {
    const problems = validateMapping({ Email: 'email', Nome: 'name', Contato: 'name' });
    assert.equal(problems.length, 1);
    assert.match(problems[0], /name/);
});

test('validateMapping is empty for a usable mapping', () => {
    assert.deepEqual(validateMapping({ Email: 'email', Nome: 'name', Empresa: 'company' }), []);
});

test('validateMapping ignores ignored columns', () => {
    assert.deepEqual(validateMapping({ Email: 'email', Extra: 'ignore' }), []);
});

// ---------------------------------------------------------------------------
// buildImportPlan
// ---------------------------------------------------------------------------

section('buildImportPlan');

function planFrom(csv: string, mapping?: ImportFieldMapping) {
    const parsed = parseCsv(csv, ',');
    const resolved = mapping ?? guessFieldMapping(parsed.headers);
    return buildImportPlan(parsed, resolved);
}

test('maps valid rows and normalises the email', () => {
    const plan = planFrom('Email,Nome\n  Ana@Example.COM ,Ana');
    assert.equal(plan.validCount, 1);
    assert.equal(plan.invalidCount, 0);
    assert.equal(plan.rows[0].email, 'ana@example.com');
    assert.equal(plan.rows[0].name, 'Ana');
    assert.equal(plan.rows[0].__row, 2);
});

test('flags an empty email as invalid', () => {
    const plan = planFrom('Email,Nome\n,Ana');
    assert.equal(plan.validCount, 0);
    assert.equal(plan.invalidCount, 1);
    assert.equal(plan.issues[0].status, 'invalid');
    assert.equal(plan.issues[0].reason, 'e-mail vazio');
});

test('flags a malformed email as invalid', () => {
    const plan = planFrom('Email\nnot-an-email');
    assert.equal(plan.invalidCount, 1);
    assert.equal(plan.issues[0].status, 'invalid');
    assert.match(plan.issues[0].reason, /inválido/);
});

test('detects duplicates inside the file, case-insensitively', () => {
    const plan = planFrom('Email\na@b.co\nA@B.CO\na@b.co');
    assert.equal(plan.validCount, 1);
    assert.equal(plan.duplicateInFileCount, 2);
    assert.equal(plan.issues.every((issue) => issue.status === 'duplicate_in_file'), true);
});

test('keeps the first occurrence of a duplicate', () => {
    const plan = planFrom('Email,Nome\na@b.co,First\nA@B.CO,Second');
    assert.equal(plan.rows.length, 1);
    assert.equal(plan.rows[0].name, 'First');
});

test('reports the line number of each issue', () => {
    // Line 3 is malformed; line 5 repeats the valid address from line 2.
    const plan = planFrom('Email\na@b.co\nbad\nc@d.co\nA@B.CO');
    const invalid = plan.issues.find((issue) => issue.status === 'invalid');
    const duplicate = plan.issues.find((issue) => issue.status === 'duplicate_in_file');
    assert.equal(invalid?.row, 3);
    assert.equal(duplicate?.row, 5);
});

test('lists unmapped columns as ignored', () => {
    const plan = planFrom('Email,utm_source\n a@b.co ,x');
    assert.deepEqual(plan.ignoredColumns, ['utm_source']);
});

test('leaves absent optional fields as null', () => {
    const plan = planFrom('Email\na@b.co');
    assert.equal(plan.rows[0].name, null);
    assert.equal(plan.rows[0].company, null);
    assert.equal(plan.rows[0].document, null);
});

test('trims surrounding whitespace from mapped values', () => {
    const plan = planFrom('Email,Nome\n a@b.co ,  Ana Silva  ');
    assert.equal(plan.rows[0].name, 'Ana Silva');
});

test('counts total rows excluding the header', () => {
    const plan = planFrom('Email\na@b.co\nb@c.co\nc@d.co');
    assert.equal(plan.totalRows, 3);
});

test('does not truncate a small file', () => {
    const plan = planFrom('Email\na@b.co');
    assert.equal(plan.truncated, false);
});

test('truncates beyond maxRows and reports it', () => {
    // parseCsv lower-cases headers, so the mapping key must be lowercase too.
    const lines = ['Email', ...Array.from({ length: 5 }, (_, index) => `user${index}@b.co`)];
    const plan = buildImportPlan(parseCsv(lines.join('\n'), ','), { email: 'email' }, 3);
    assert.equal(plan.truncated, true);
    assert.equal(plan.totalRows, 5);
    assert.equal(plan.validCount, 3);
});

test('IMPORT_MAX_ROWS is a sane ceiling', () => {
    assert.equal(IMPORT_MAX_ROWS, 20000);
});

test('a mapping with no email column yields no valid rows', () => {
    const plan = planFrom('Nome\nAna', { Nome: 'name' });
    assert.equal(plan.validCount, 0);
    assert.equal(plan.invalidCount, 1);
});

// ---------------------------------------------------------------------------
// parseImportSource
// ---------------------------------------------------------------------------

section('parseImportSource');

test('auto-detects the delimiter and suggests a mapping', () => {
    // parseCsv normalises headers to lower-case, so the mapping keys are lower-case.
    const source = parseImportSource('E-mail;Nome\na@b.co;Ana');
    assert.equal(source.delimiter, ';');
    assert.deepEqual(source.parsed.headers, ['e-mail', 'nome']);
    assert.equal(source.mapping['e-mail'], 'email');
    assert.equal(source.mapping.nome, 'name');
});

test('honours an explicit delimiter over detection', () => {
    const source = parseImportSource('email|nome\na@b.co|Ana', '|');
    assert.equal(source.delimiter, '|');
    assert.deepEqual(source.parsed.headers, ['email', 'nome']);
});

test('parses pasted text the same way as a file', () => {
    const source = parseImportSource('Email,Nome\na@b.co,Ana\nb@c.co,Bruno');
    assert.equal(source.parsed.rows.length, 2);
    assert.equal(source.parsed.rows[1][1], 'Bruno');
});

test('produces a mapping that passes validation', () => {
    const source = parseImportSource('Email,Nome,Empresa\na@b.co,Ana,ACME');
    assert.deepEqual(validateMapping(source.mapping), []);
});

// ---------------------------------------------------------------------------
// buildErrorReportCsv
// ---------------------------------------------------------------------------

section('buildErrorReportCsv');

function row(overrides: Partial<NewsletterImportRow>): NewsletterImportRow {
    return {
        id: 'row-id',
        job_id: 'job-id',
        line_number: 2,
        email: 'a@b.co',
        status: 'invalid',
        reason: null,
        raw: {},
        created_at: '2026-09-21T00:00:00.000Z',
        ...overrides,
    } as NewsletterImportRow;
}

test('emits a header row even with no failures', () => {
    assert.equal(buildErrorReportCsv([]), 'linha,email,situacao,motivo');
});

test('writes one line per failed row', () => {
    const csv = buildErrorReportCsv([
        row({ line_number: 3, email: 'bad', status: 'invalid', reason: 'formato de e-mail inválido' }),
    ]);
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[1], '3,bad,invalid,formato de e-mail inválido');
});

test('quotes values containing commas', () => {
    const csv = buildErrorReportCsv([row({ reason: 'duplicado, já existe' })]);
    assert.match(csv, /"duplicado, já existe"/);
});

test('escapes embedded double quotes', () => {
    const csv = buildErrorReportCsv([row({ reason: 'apelido "x"' })]);
    assert.match(csv, /"apelido ""x"""/);
});

test('renders a null email and reason as empty fields', () => {
    const csv = buildErrorReportCsv([row({ email: null, reason: null })]);
    assert.equal(csv.split('\r\n')[1], '2,,invalid,');
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    let passed = 0;
    const failures: { name: string; error: unknown }[] = [];

    for (const { name, fn } of tests) {
        try {
            await fn();
            passed += 1;
        } catch (error) {
            failures.push({ name, error });
        }
    }

    console.log(`\n${passed}/${tests.length} testes passaram.`);

    if (failures.length > 0) {
        console.error(`\n${failures.length} falha(s):`);
        for (const { name, error } of failures) {
            console.error(`\n  ✗ ${name}`);
            console.error(error instanceof Error ? error.stack ?? error.message : error);
        }
        process.exitCode = 1;
        return;
    }

    console.log('OK');
}

void main();
