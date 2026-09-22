/**
 * Bulk import wizard + import history for the Informativo list management.
 *
 * Split from `ListsManager.tsx` so the wizard's state machine stays readable.
 * The flow is deliberately gated:
 *
 *   source  → pick a file or paste text, parse + auto-detect the delimiter
 *   mapping → confirm which column feeds which field (e-mail is mandatory)
 *   options → update-existing / create-contacts / status / consent
 *   running → chunked RPC calls with a progress bar
 *   done    → summary, per-row outcomes and a downloadable error report
 *
 * Nothing is written before the operator confirms the mapping, and the job row
 * is created before the first chunk so a crash still leaves an audit trail.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import {
    Alert,
    Badge,
    Button,
    Card,
    EmptyState,
    Field,
    Input,
    Modal,
    Select,
    Spinner,
    Stat,
    Textarea,
    Toggle,
} from './ui';
import {
    CONSENT_SOURCE_LABELS,
    IMPORT_ROW_STATUS_LABELS,
    IMPORT_SOURCE_LABELS,
    IMPORT_STATUS_LABELS,
    IMPORT_TARGET_LABELS,
    SUBSCRIBER_STATUS_LABELS,
    type ConsentSource,
    type ImportFieldMapping,
    type ImportRowOutcome,
    type ImportTargetField,
    type NewsletterImportJob,
    type NewsletterImportOptions,
    type NewsletterImportRow,
    type NewsletterImportSource,
    type NewsletterList,
    type SubscriberStatus,
} from '../../../types/newsletter';
import {
    buildErrorReportCsv,
    buildImportPlan,
    createImportJob,
    finalizeImportJob,
    listImportIssues,
    listImportJobs,
    parseImportSource,
    readFileAsText,
    runImport,
    validateMapping,
    type ImportPlan,
    type ParsedImportSource,
} from '../../../lib/newsletter/import';
import { downloadCsv } from '../../../lib/newsletter/csv';
import { formatDateTime, formatInteger } from '../../../lib/newsletter/client';

const TARGET_OPTIONS: ImportTargetField[] = [
    'email',
    'name',
    'company',
    'job_title',
    'phone',
    'preference_area',
    'document',
    'ignore',
];

function rowStatusTone(
    status: ImportRowOutcome['status'],
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
    switch (status) {
        case 'imported':
        case 'updated':
            return 'success';
        case 'duplicate_in_file':
        case 'duplicate_in_base':
        case 'skipped':
            return 'warning';
        case 'invalid':
        case 'failed':
            return 'danger';
        default:
            return 'info';
    }
}

function getJobStatusTone(
    status: NewsletterImportJob['status'],
): 'success' | 'danger' | 'info' {
    if (status === 'completed') return 'success';
    if (status === 'failed') return 'danger';
    return 'info';
}

// ---------------------------------------------------------------------------
// Wizard Step Components
// ---------------------------------------------------------------------------

type WizardStep = 'source' | 'mapping' | 'options' | 'running' | 'done';

const WizardSourceStep: React.FC<{
    rawText: string;
    setRawText: (text: string) => void;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onFileChange: (file: File) => void | Promise<void>;
}> = ({ rawText, setRawText, fileInputRef, onFileChange }) => {
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        // Reset so selecting the same file again still fires a change event.
        input.value = '';
        if (!file) return;
        // `handleFile` reports its own errors via state; swallow the rejection
        // here so a failed read never surfaces as an unhandled promise.
        Promise.resolve(onFileChange(file)).catch(() => undefined);
    };

    return (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv,text/csv,text/plain"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <Button
                    icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                    onClick={() => fileInputRef.current?.click()}
                >
                    Escolher arquivo CSV
                </Button>
                <span className="text-xs text-[var(--theme-text-muted)]">
                    ou cole os dados abaixo
                </span>
            </div>

            <Field label="Dados colados" hint="A primeira linha deve conter os cabeçalhos.">
                {(id) => (
                    <Textarea
                        id={id}
                        value={rawText}
                        onChange={(event) => setRawText(event.target.value)}
                        placeholder={'email,nome,empresa\nmaria@exemplo.com,Maria,Silva Advogados'}
                        className="min-h-[180px] font-mono text-xs"
                    />
                )}
            </Field>
        </>
    );
};

const WizardMappingStep: React.FC<{
    parsed: ParsedImportSource;
    mapping: ImportFieldMapping;
    setMapping: React.Dispatch<React.SetStateAction<ImportFieldMapping>>;
    mappingProblems: string[];
    plan: ImportPlan | null;
}> = ({ parsed, mapping, setMapping, mappingProblems, plan }) => (
    <>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--theme-text-muted)]">
            <span>
                Delimitador detectado:{' '}
                <code className="rounded bg-[var(--theme-surface)] px-1">
                    {parsed.delimiter === '\t' ? String.raw`\t` : parsed.delimiter}
                </code>
            </span>
            <span>{formatInteger(parsed.parsed.headers.length)} colunas</span>
            <span>{formatInteger(parsed.parsed.rows.length)} linhas</span>
        </div>

        {mappingProblems.length > 0 ? (
            <Alert tone="error">
                <ul className="list-disc pl-4">
                    {mappingProblems.map((problem) => (
                        <li key={problem}>{problem}</li>
                    ))}
                </ul>
            </Alert>
        ) : null}

        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
                <thead>
                    <tr className="border-b border-[var(--theme-border)] text-left text-[11px] uppercase text-[var(--theme-text-muted)]">
                        <th scope="col" className="py-2">Coluna de origem</th>
                        <th scope="col" className="py-2">Exemplo</th>
                        <th scope="col" className="py-2">Campo de destino</th>
                    </tr>
                </thead>
                <tbody>
                    {parsed.parsed.headers.map((header, index) => (
                        <tr
                            key={header}
                            className="border-b border-[var(--theme-border)]/60"
                        >
                            <td className="py-2 pr-3 font-medium">{header}</td>
                            <td className="py-2 pr-3 text-xs text-[var(--theme-text-muted)]">
                                {parsed.parsed.rows[0]?.[index] ?? '—'}
                            </td>
                            <td className="py-2">
                                <Select
                                    aria-label={`Destino da coluna ${header}`}
                                    value={mapping[header] ?? 'ignore'}
                                    onChange={(event) =>
                                        setMapping((current) => ({
                                            ...current,
                                            [header]: event.target.value as ImportTargetField,
                                        }))
                                    }
                                >
                                    {TARGET_OPTIONS.map((target) => (
                                        <option key={target} value={target}>
                                            {IMPORT_TARGET_LABELS[target]}
                                        </option>
                                    ))}
                                </Select>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {plan ? (
            <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Válidas" value={formatInteger(plan.validCount)} tone="success" />
                <Stat label="Inválidas" value={formatInteger(plan.invalidCount)} tone="danger" />
                <Stat
                    label="Duplicadas no arquivo"
                    value={formatInteger(plan.duplicateInFileCount)}
                    tone="warning"
                />
            </div>
        ) : null}

        {plan?.truncated ? (
            <Alert tone="info">
                O arquivo excede o limite de linhas por importação; apenas as primeiras
                linhas serão processadas.
            </Alert>
        ) : null}
    </>
);

const WizardOptionsStep: React.FC<{
    options: NewsletterImportOptions;
    setOptions: React.Dispatch<React.SetStateAction<NewsletterImportOptions>>;
}> = ({ options, setOptions }) => (
    <>
        <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Situação dos novos inscritos">
                {(id) => (
                    <Select
                        id={id}
                        value={options.subscriber_status}
                        onChange={(event) =>
                            setOptions((current) => ({
                                ...current,
                                subscriber_status: event.target.value as SubscriberStatus,
                            }))
                        }
                    >
                        {Object.entries(SUBSCRIBER_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>
                )}
            </Field>

            <Field label="Origem do consentimento">
                {(id) => (
                    <Select
                        id={id}
                        value={options.source}
                        onChange={(event) =>
                            setOptions((current) => ({
                                ...current,
                                source: event.target.value as ConsentSource,
                            }))
                        }
                    >
                        {Object.entries(CONSENT_SOURCE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>
                )}
            </Field>

            <Field label="Detalhe da origem">
                {(id) => (
                    <Input
                        id={id}
                        value={options.source_detail}
                        onChange={(event) =>
                            setOptions((current) => ({
                                ...current,
                                source_detail: event.target.value,
                            }))
                        }
                    />
                )}
            </Field>

            <Field label="Texto de consentimento">
                {(id) => (
                    <Input
                        id={id}
                        value={options.consent_text}
                        onChange={(event) =>
                            setOptions((current) => ({
                                ...current,
                                consent_text: event.target.value,
                            }))
                        }
                    />
                )}
            </Field>
        </div>

        <Toggle
            checked={options.update_existing}
            onChange={(value) =>
                setOptions((current) => ({ ...current, update_existing: value }))
            }
            label="Atualizar inscritos já existentes"
            hint="Quando desligado, e-mails já presentes na base são ignorados."
        />

        <Toggle
            checked={options.create_contacts}
            onChange={(value) =>
                setOptions((current) => ({ ...current, create_contacts: value }))
            }
            label="Criar/atualizar contato no CRM"
            hint="Mantém o cadastro de CRM sincronizado com a lista."
        />
    </>
);

const WizardRunningStep: React.FC<{
    progress: { processed: number; total: number };
}> = ({ progress }) => (
    <div className="flex flex-col gap-3">
        <Spinner label="Importando contatos" />
        <progress
            className="h-2 w-full overflow-hidden rounded-full accent-[var(--theme-gold)] bg-[var(--theme-surface)]"
            value={progress.processed}
            max={progress.total}
        />
        <p className="text-xs text-[var(--theme-text-muted)]">
            {formatInteger(progress.processed)} de {formatInteger(progress.total)} linhas
        </p>
    </div>
);

const WizardDoneStep: React.FC<{
    summary: {
        imported: number;
        updated: number;
        duplicates: number;
        invalid: number;
        failed: number;
    } | null;
    result: ImportRowOutcome[] | null;
}> = ({ summary, result }) => {
    if (!summary) return null;
    return (
        <>
            <Alert tone="success">
                <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Importação concluída.
                </span>
            </Alert>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label="Importadas" value={formatInteger(summary.imported)} tone="success" />
                <Stat label="Atualizadas" value={formatInteger(summary.updated)} tone="info" />
                <Stat label="Duplicadas" value={formatInteger(summary.duplicates)} tone="warning" />
                <Stat label="Inválidas" value={formatInteger(summary.invalid)} tone="danger" />
                <Stat label="Falhas" value={formatInteger(summary.failed)} tone="danger" />
            </div>

            {result && result.length > 0 ? (
                <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--theme-border)]">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-[var(--theme-card)]">
                            <tr className="border-b border-[var(--theme-border)] text-left text-[var(--theme-text-muted)]">
                                <th scope="col" className="px-3 py-2">Linha</th>
                                <th scope="col" className="px-3 py-2">E-mail</th>
                                <th scope="col" className="px-3 py-2">Situação</th>
                                <th scope="col" className="px-3 py-2">Motivo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.slice(0, 200).map((entry, index) => (
                                <tr
                                    key={`${entry.row}-${index}`}
                                    className="border-b border-[var(--theme-border)]/50"
                                >
                                    <td className="px-3 py-1">{entry.row}</td>
                                    <td className="px-3 py-1">{entry.email || '—'}</td>
                                    <td className="px-3 py-1">
                                        <Badge tone={rowStatusTone(entry.status)}>
                                            {IMPORT_ROW_STATUS_LABELS[entry.status]}
                                        </Badge>
                                    </td>
                                    <td className="px-3 py-1 text-[var(--theme-text-muted)]">
                                        {entry.reason ?? '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </>
    );
};

const WizardFooter: React.FC<{
    step: WizardStep;
    rawText: string;
    mappingProblems: string[];
    plan: ImportPlan | null;
    busy: boolean;
    onClose: () => void;
    onHandlePaste: () => void;
    onSetStep: (step: WizardStep) => void;
    onRun: () => void;
    onDownloadReport: () => void;
    onDone: () => Promise<void>;
}> = ({
    step,
    rawText,
    mappingProblems,
    plan,
    busy,
    onClose,
    onHandlePaste,
    onSetStep,
    onRun,
    onDownloadReport,
    onDone,
}) => {
        switch (step) {
            case 'source':
                return (
                    <div className="flex justify-end gap-2">
                        <Button onClick={onClose}>Cancelar</Button>
                        <Button variant="primary" disabled={!rawText.trim()} onClick={onHandlePaste}>
                            Analisar texto
                        </Button>
                    </div>
                );
            case 'mapping':
                return (
                    <div className="flex justify-between gap-2">
                        <Button onClick={() => onSetStep('source')}>Voltar</Button>
                        <Button
                            variant="primary"
                            disabled={mappingProblems.length > 0}
                            onClick={() => onSetStep('options')}
                        >
                            Continuar
                        </Button>
                    </div>
                );
            case 'options':
                return (
                    <div className="flex justify-between gap-2">
                        <Button onClick={() => onSetStep('mapping')}>Voltar</Button>
                        <Button variant="primary" loading={busy} onClick={onRun}>
                            Importar {plan ? formatInteger(plan.validCount) : ''} contato(s)
                        </Button>
                    </div>
                );
            case 'running':
                return (
                    <div className="flex justify-end">
                        <Button disabled>Importando…</Button>
                    </div>
                );
            case 'done':
                return (
                    <div className="flex justify-end gap-2">
                        <Button icon={<Download className="h-3.5 w-3.5" />} onClick={onDownloadReport}>
                            Baixar erros
                        </Button>
                        <Button variant="primary" onClick={() => void onDone()}>
                            Concluir
                        </Button>
                    </div>
                );
        }
    };

// ---------------------------------------------------------------------------
// Wizard Modal
// ---------------------------------------------------------------------------

export const ImportWizardModal: React.FC<{
    list: NewsletterList;
    onClose: () => void;
    onDone: () => Promise<void>;
}> = ({ list, onClose, onDone }) => {
    const [step, setStep] = useState<WizardStep>('source');
    const [source, setSource] = useState<NewsletterImportSource>('csv');
    const [rawText, setRawText] = useState('');
    const [fileName, setFileName] = useState<string | null>(null);
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [parsed, setParsed] = useState<ParsedImportSource | null>(null);
    const [mapping, setMapping] = useState<ImportFieldMapping>({});
    const [options, setOptions] = useState<NewsletterImportOptions>({
        update_existing: false,
        create_contacts: true,
        subscriber_status: 'active',
        source: 'admin_import',
        source_detail: 'importação em lote',
        consent_text: 'Importação em lote no painel administrativo.',
    });
    const [progress, setProgress] = useState({ processed: 0, total: 0 });
    const [result, setResult] = useState<ImportRowOutcome[] | null>(null);
    const [job, setJob] = useState<NewsletterImportJob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement | null>(null);

    const plan: ImportPlan | null = useMemo(
        () => (parsed ? buildImportPlan(parsed.parsed, mapping) : null),
        [parsed, mapping],
    );

    const mappingProblems = useMemo(() => (parsed ? validateMapping(mapping) : []), [parsed, mapping]);

    const handleFile = async (file: File) => {
        setError(null);
        try {
            const text = await readFileAsText(file);
            const next = parseImportSource(text);
            setRawText(text);
            setFileName(file.name);
            setFileSize(file.size);
            setParsed(next);
            setMapping(next.mapping);
            setSource('csv');
            setStep('mapping');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao ler o arquivo.');
        }
    };

    const handlePaste = () => {
        setError(null);
        if (!rawText.trim()) {
            setError('Cole os dados antes de continuar.');
            return;
        }
        try {
            const next = parseImportSource(rawText);
            setParsed(next);
            setMapping(next.mapping);
            setSource('paste');
            setFileName(null);
            setFileSize(null);
            setStep('mapping');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao interpretar o texto colado.');
        }
    };

    const run = async () => {
        if (!plan || !parsed) return;
        setBusy(true);
        setError(null);
        setStep('running');
        setProgress({ processed: 0, total: plan.rows.length });

        try {
            const created = await createImportJob({
                listId: list.id,
                source,
                fileName,
                fileSizeBytes: fileSize,
                delimiter: parsed.delimiter,
                hasHeader: true,
                sourceColumns: parsed.parsed.headers,
                fieldMapping: mapping,
                options,
                totalRows: plan.totalRows,
                validRows: plan.validCount,
                invalidRows: plan.invalidCount,
                duplicateRows: plan.duplicateInFileCount,
            });
            setJob(created);

            const outcome = await runImport({
                jobId: created.id,
                listId: list.id,
                rows: plan.rows,
                options,
                onProgress: (processed, total) => setProgress({ processed, total }),
            });

            // Client-side rejections are merged in so the report is complete.
            const clientIssues: ImportRowOutcome[] = plan.issues.map((issue) => ({
                row: issue.row,
                email: issue.email,
                status: issue.status,
                reason: issue.reason,
            }));

            setResult([...clientIssues, ...outcome.outcomes]);
            await finalizeImportJob(created.id, 'completed');
            setStep('done');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao executar a importação.');
            setStep('options');
        } finally {
            setBusy(false);
        }
    };

    const summary = useMemo(() => {
        if (!result) return null;
        const count = (status: ImportRowOutcome['status']) =>
            result.filter((entry) => entry.status === status).length;
        return {
            imported: count('imported'),
            updated: count('updated'),
            duplicates: count('duplicate_in_file') + count('duplicate_in_base'),
            invalid: count('invalid'),
            failed: count('failed'),
        };
    }, [result]);

    const downloadReport = async () => {
        if (!job) return;
        try {
            const rows = await listImportIssues(job.id);
            downloadCsv(`importacao-${job.id}-erros.csv`, buildErrorReportCsv(rows));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao gerar o relatório.');
        }
    };

    return (
        <Modal
            open
            onClose={step === 'running' ? () => undefined : onClose}
            title={`Importar contatos — ${list.name}`}
            description="Mapeie as colunas, valide e acompanhe o resultado linha a linha."
            width="lg"
            footer={
                <WizardFooter
                    step={step}
                    rawText={rawText}
                    mappingProblems={mappingProblems}
                    plan={plan}
                    busy={busy}
                    onClose={onClose}
                    onHandlePaste={handlePaste}
                    onSetStep={setStep}
                    onRun={() => void run()}
                    onDownloadReport={() => void downloadReport()}
                    onDone={onDone}
                />
            }
        >
            <div className="flex flex-col gap-4">
                {error ? <Alert tone="error">{error}</Alert> : null}

                {step === 'source' ? (
                    <WizardSourceStep
                        rawText={rawText}
                        setRawText={setRawText}
                        fileInputRef={fileInput}
                        onFileChange={handleFile}
                    />
                ) : null}

                {step === 'mapping' && parsed ? (
                    <WizardMappingStep
                        parsed={parsed}
                        mapping={mapping}
                        setMapping={setMapping}
                        mappingProblems={mappingProblems}
                        plan={plan}
                    />
                ) : null}

                {step === 'options' ? (
                    <WizardOptionsStep options={options} setOptions={setOptions} />
                ) : null}

                {step === 'running' ? (
                    <WizardRunningStep progress={progress} />
                ) : null}

                {step === 'done' ? (
                    <WizardDoneStep summary={summary} result={result} />
                ) : null}
            </div>
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// History Panel
// ---------------------------------------------------------------------------

export const ImportHistoryPanel: React.FC<{
    list: NewsletterList;
    onError: (message: string) => void;
}> = ({ list, onError }) => {
    const [jobs, setJobs] = useState<NewsletterImportJob[]>([]);
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [issues, setIssues] = useState<NewsletterImportRow[]>([]);
    const [issuesLoading, setIssuesLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setJobs(await listImportJobs(list.id, 15));
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Falha ao carregar o histórico.');
        } finally {
            setLoading(false);
        }
    }, [list.id, onError]);

    useEffect(() => {
        void load();
    }, [load]);

    const openIssues = async (jobId: string) => {
        if (expanded === jobId) {
            setExpanded(null);
            return;
        }
        setExpanded(jobId);
        setIssuesLoading(true);
        try {
            setIssues(await listImportIssues(jobId));
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Falha ao carregar as linhas com erro.');
        } finally {
            setIssuesLoading(false);
        }
    };

    const downloadIssues = async (jobId: string) => {
        try {
            const rows = await listImportIssues(jobId);
            downloadCsv(`importacao-${jobId}-erros.csv`, buildErrorReportCsv(rows));
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Falha ao gerar o relatório.');
        }
    };

    const renderIssues = () => {
        if (issuesLoading) {
            return <Spinner label="Carregando erros" />;
        }

        if (issues.length === 0) {
            return (
                <p className="text-xs text-[var(--theme-text-muted)]">
                    Nenhuma linha com problema neste lote.
                </p>
            );
        }

        return (
            <div className="max-h-56 overflow-y-auto rounded border border-[var(--theme-border)]">
                <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[var(--theme-card)]">
                        <tr className="border-b border-[var(--theme-border)] text-left text-[var(--theme-text-muted)]">
                            <th scope="col" className="px-2 py-1">Linha</th>
                            <th scope="col" className="px-2 py-1">E-mail</th>
                            <th scope="col" className="px-2 py-1">Situação</th>
                            <th scope="col" className="px-2 py-1">Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {issues.map((row) => (
                            <tr
                                key={row.id}
                                className="border-b border-[var(--theme-border)]/50"
                            >
                                <td className="px-2 py-1">{row.line_number}</td>
                                <td className="px-2 py-1">{row.email ?? '—'}</td>
                                <td className="px-2 py-1">
                                    {IMPORT_ROW_STATUS_LABELS[row.status]}
                                </td>
                                <td className="px-2 py-1 text-[var(--theme-text-muted)]">
                                    {row.reason ?? '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const renderContent = () => {
        if (loading && jobs.length === 0) {
            return <Spinner label="Carregando histórico" />;
        }

        if (jobs.length === 0) {
            return (
                <EmptyState
                    title="Nenhuma importação"
                    message="Os lotes importados para esta lista aparecerão aqui."
                />
            );
        }

        return (
            <ul className="flex flex-col gap-2">
                {jobs.map((job) => (
                    <li
                        key={job.id}
                        className="rounded-lg border border-[var(--theme-border)] px-3 py-2"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge tone={getJobStatusTone(job.status)}>
                                    {IMPORT_STATUS_LABELS[job.status]}
                                </Badge>
                                <span className="text-xs text-[var(--theme-text-muted)]">
                                    {IMPORT_SOURCE_LABELS[job.source]}
                                    {job.file_name ? ` · ${job.file_name}` : ''}
                                </span>
                                <span className="text-xs text-[var(--theme-text-muted)]">
                                    {formatDateTime(job.created_at)}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="text-[var(--theme-text-muted)]">
                                    {formatInteger(job.imported_rows)} importadas ·{' '}
                                    {formatInteger(job.updated_rows)} atualizadas ·{' '}
                                    {formatInteger(job.duplicate_rows)} duplicadas ·{' '}
                                    {formatInteger(job.invalid_rows + job.failed_rows)} com erro
                                </span>
                                <Button size="sm" onClick={() => void openIssues(job.id)}>
                                    {expanded === job.id ? 'Ocultar' : 'Ver erros'}
                                </Button>
                                <Button
                                    size="sm"
                                    icon={<Download className="h-3.5 w-3.5" />}
                                    onClick={() => void downloadIssues(job.id)}
                                >
                                    CSV
                                </Button>
                            </div>
                        </div>

                        {expanded === job.id ? (
                            <div className="mt-2">{renderIssues()}</div>
                        ) : null}
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <Card
            title="Histórico de importações"
            subtitle="Cada lote fica registrado com o resultado linha a linha."
            actions={
                <Button size="sm" loading={loading} onClick={() => void load()}>
                    Atualizar
                </Button>
            }
        >
            {renderContent()}
        </Card>
    );
};
