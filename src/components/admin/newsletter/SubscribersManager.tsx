/**
 * Subscriber management: listing, search, filters, sorting, pagination, CRUD,
 * tags, CSV import/export, interaction history and LGPD operations.
 *
 * Selection semantics: bulk actions operate on the explicit checkbox selection
 * only. There is no "select all matching the filter" shortcut, because an
 * operator must see exactly which records an irreversible action will touch.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Download,
    Eye,
    FileDown,
    Plus,
    ShieldAlert,
    Trash2,
    Upload,
    UserCheck,
    UserX,
} from 'lucide-react';
import type {
    ConsentSource,
    NewsletterList,
    NewsletterTag,
    SubscriberOverviewRow,
    SubscriberStatus,
    SubscriberTimelineEntry,
} from '../../../types/newsletter';
import {
    CONSENT_SOURCE_LABELS,
    SUBSCRIBER_STATUS_LABELS,
} from '../../../types/newsletter';
import {
    anonymizeSubscriber,
    createSubscriber,
    deleteSubscribers,
    exportSubscriberData,
    fetchSubscribersForExport,
    getSubscriber,
    importSubscribers,
    listSubscribers,
    listTags,
    setSubscriberStatus,
    setSubscriberTags,
    subscriberStats,
    subscriberTimeline,
    updateSubscriber,
    type SubscriberStats,
} from '../../../lib/newsletter/subscribers';
import { createTag } from '../../../lib/newsletter/subscribers';
import { downloadCsv, mapImportRows, parseCsv, toCsv } from '../../../lib/newsletter/csv';
import { formatDate, formatDateTime, formatInteger } from '../../../lib/newsletter/client';
import {
    Alert,
    Badge,
    Button,
    Card,
    ConfirmDialog,
    EmptyState,
    Field,
    Input,
    Modal,
    Pagination,
    Select,
    Spinner,
    Stat,
    Textarea,
    ToastContext,
    cn,
} from './ui';

const PAGE_SIZES = [25, 50, 100];

function statusTone(status: SubscriberStatus): 'success' | 'warning' | 'danger' | 'neutral' {
    switch (status) {
        case 'active':
            return 'success';
        case 'pending':
            return 'warning';
        case 'bounced':
        case 'complained':
            return 'danger';
        default:
            return 'neutral';
    }
}

export const SubscribersManager: React.FC<{ canWrite: boolean; lists: NewsletterList[] }> = ({
    canWrite,
    lists,
}) => {
    const toast = React.useContext(ToastContext);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [rows, setRows] = useState<SubscriberOverviewRow[]>([]);
    const [stats, setStats] = useState<SubscriberStats | null>(null);
    const [tags, setTags] = useState<NewsletterTag[]>([]);

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [status, setStatus] = useState<SubscriberStatus | ''>('');
    const [source, setSource] = useState<ConsentSource | ''>('');
    const [tagId, setTagId] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortAscending, setSortAscending] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editing, setEditing] = useState<SubscriberOverviewRow | null>(null);
    const [creating, setCreating] = useState(false);
    const [detail, setDetail] = useState<{ row: SubscriberOverviewRow; timeline: SubscriberTimelineEntry[] } | null>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [anonymizeTarget, setAnonymizeTarget] = useState<SubscriberOverviewRow | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<SubscriberOverviewRow | null>(null);

    // Debounce the search box so typing does not fire a query per keystroke.
    useEffect(() => {
        const timer = window.setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [search]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const result = await listSubscribers({
                page,
                pageSize,
                search: debouncedSearch,
                status: status || null,
                source: source || null,
                tagId: tagId || null,
                sortBy,
                sortAscending,
            });

            setRows(result.rows);
            setTotal(result.total);
            setTotalPages(result.totalPages);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'falha ao carregar inscritos');
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, debouncedSearch, status, source, tagId, sortBy, sortAscending]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        void subscriberStats().then(setStats).catch(() => undefined);
        void listTags().then(setTags).catch(() => undefined);
    }, []);

    // Clear selection whenever the visible page changes: acting on rows that are
    // no longer on screen is a footgun.
    useEffect(() => {
        setSelected(new Set());
    }, [page, pageSize, debouncedSearch, status, source, tagId]);

    const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

    const toggleAllOnPage = () => {
        setSelected((current) => {
            const next = new Set(current);
            if (allOnPageSelected) rows.forEach((row) => next.delete(row.id));
            else rows.forEach((row) => next.add(row.id));
            return next;
        });
    };

    const toggleOne = (id: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const runBulk = async (action: () => Promise<void>, successMessage: string) => {
        setBusy(true);
        try {
            await action();
            toast.push(successMessage, 'success');
            setSelected(new Set());
            await load();
            await subscriberStats().then(setStats).catch(() => undefined);
        } catch (actionError) {
            toast.push(actionError instanceof Error ? actionError.message : 'operação falhou', 'error');
        } finally {
            setBusy(false);
        }
    };

    const exportCsv = async () => {
        try {
            const data = await fetchSubscribersForExport(debouncedSearch);
            const csv = toCsv(
                ['email', 'nome', 'status', 'origem', 'area', 'criado_em', 'confirmado_em', 'aberturas', 'cliques', 'tags'],
                data.map((row) => [
                    row.email,
                    row.name ?? '',
                    SUBSCRIBER_STATUS_LABELS[row.status] ?? row.status,
                    CONSENT_SOURCE_LABELS[row.source] ?? row.source,
                    row.preference_area,
                    formatDate(row.created_at),
                    row.confirmed_at ? formatDate(row.confirmed_at) : '',
                    row.total_opens,
                    row.total_clicks,
                    row.tags.join(' | '),
                ]),
            );

            downloadCsv(`inscritos-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            toast.push(`${data.length} registro(s) exportado(s).`, 'success');
        } catch (exportError) {
            toast.push(exportError instanceof Error ? exportError.message : 'falha ao exportar', 'error');
        }
    };

    const openDetail = async (row: SubscriberOverviewRow) => {
        try {
            const [full, timeline] = await Promise.all([getSubscriber(row.id), subscriberTimeline(row.id, 50)]);
            setDetail({
                row: { ...row, status: full.status, preference_area: full.preference_area },
                timeline,
            });
        } catch (detailError) {
            toast.push(detailError instanceof Error ? detailError.message : 'falha ao carregar histórico', 'error');
        }
    };

    const exportOneData = async (row: SubscriberOverviewRow) => {
        try {
            const payload = await exportSubscriberData(row.id);
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `lgpd-${row.email}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            toast.push('Dados do titular exportados (LGPD art. 18, II).', 'success');
        } catch (exportError) {
            toast.push(exportError instanceof Error ? exportError.message : 'falha ao exportar', 'error');
        }
    };

    const importSummary = useMemo(() => {
        if (!importOpen) return null;
        return null;
    }, [importOpen]);

    return (
        <div className="flex flex-col gap-5">
            {error ? <Alert tone="error">{error}</Alert> : null}

            {stats ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <Stat label="Total" value={formatInteger(stats.total)} />
                    <Stat label="Ativos" value={formatInteger(stats.active)} />
                    <Stat label="Pendentes" value={formatInteger(stats.pending)} tone="warning" />
                    <Stat label="Descadastrados" value={formatInteger(stats.unsubscribed)} />
                    <Stat label="Com bounce" value={formatInteger(stats.bounced)} tone={stats.bounced > 0 ? 'danger' : 'neutral'} />
                </div>
            ) : null}

            <Card
                title="Inscritos"
                subtitle="Base completa de contatos, com origem, engajamento e situação de consentimento."
                actions={
                    <>
                        <Button size="sm" icon={<FileDown className="h-3.5 w-3.5" aria-hidden="true" />} onClick={exportCsv}>
                            Exportar CSV
                        </Button>
                        {canWrite ? (
                            <>
                                <Button
                                    size="sm"
                                    icon={<Upload className="h-3.5 w-3.5" aria-hidden="true" />}
                                    onClick={() => setImportOpen(true)}
                                >
                                    Importar CSV
                                </Button>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                                    onClick={() => setCreating(true)}
                                >
                                    Novo inscrito
                                </Button>
                            </>
                        ) : null}
                    </>
                }
            >
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
                    <Field label="Buscar">
                        {(id) => (
                            <Input
                                id={id}
                                type="search"
                                value={search}
                                placeholder="e-mail ou nome"
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        )}
                    </Field>

                    <Field label="Situação">
                        {(id) => (
                            <Select
                                id={id}
                                value={status}
                                onChange={(event) => {
                                    setStatus(event.target.value as SubscriberStatus | '');
                                    setPage(1);
                                }}
                            >
                                <option value="">Todas</option>
                                {Object.entries(SUBSCRIBER_STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Origem">
                        {(id) => (
                            <Select
                                id={id}
                                value={source}
                                onChange={(event) => {
                                    setSource(event.target.value as ConsentSource | '');
                                    setPage(1);
                                }}
                            >
                                <option value="">Todas</option>
                                {Object.entries(CONSENT_SOURCE_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Tag">
                        {(id) => (
                            <Select
                                id={id}
                                value={tagId}
                                onChange={(event) => {
                                    setTagId(event.target.value);
                                    setPage(1);
                                }}
                            >
                                <option value="">Todas</option>
                                {tags.map((tag) => (
                                    <option key={tag.id} value={tag.id}>
                                        {tag.name}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Ordenar por">
                        {(id) => (
                            <Select
                                id={id}
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value)}
                            >
                                <option value="created_at">Data de cadastro</option>
                                <option value="email">E-mail</option>
                                <option value="name">Nome</option>
                                <option value="engagement_score">Engajamento</option>
                                <option value="last_event_at">Última interação</option>
                                <option value="total_opens">Aberturas</option>
                                <option value="total_clicks">Cliques</option>
                            </Select>
                        )}
                    </Field>

                    <Field label="Direção">
                        {(id) => (
                            <Select
                                id={id}
                                value={sortAscending ? 'asc' : 'desc'}
                                onChange={(event) => setSortAscending(event.target.value === 'asc')}
                            >
                                <option value="desc">Decrescente</option>
                                <option value="asc">Crescente</option>
                            </Select>
                        )}
                    </Field>
                </div>

                {/* Bulk actions ------------------------------------------------- */}
                {canWrite && selected.size > 0 ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--theme-gold)] bg-[var(--theme-surface)] px-3 py-2">
                        <span className="text-xs text-[var(--theme-text-main)]">{selected.size} selecionado(s)</span>
                        <Button
                            size="sm"
                            icon={<UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                            disabled={busy}
                            onClick={() =>
                                runBulk(
                                    () => setSubscriberStatus([...selected], 'active'),
                                    'Inscrições reativadas (confirmadas automaticamente).',
                                )
                            }
                        >
                            Reativar
                        </Button>
                        <Button
                            size="sm"
                            icon={<UserX className="h-3.5 w-3.5" aria-hidden="true" />}
                            disabled={busy}
                            onClick={() =>
                                runBulk(
                                    () => setSubscriberStatus([...selected], 'unsubscribed', 'ação manual no painel'),
                                    'Inscrições canceladas.',
                                )
                            }
                        >
                            Descadastrar
                        </Button>
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => setDeleteTarget(rows[0] ?? null)}>
                            Excluir…
                        </Button>
                    </div>
                ) : null}

                {/* Table ------------------------------------------------------- */}
                <div className="mt-4 overflow-x-auto">
                    {loading ? (
                        <Spinner label="Carregando inscritos" />
                    ) : rows.length === 0 ? (
                        <EmptyState
                            title="Nenhum inscrito encontrado"
                            message="Ajuste os filtros de busca ou importe uma base em CSV para começar."
                            action={
                                canWrite ? (
                                    <Button variant="primary" onClick={() => setImportOpen(true)}>
                                        Importar CSV
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <table className="w-full min-w-[860px] border-collapse text-sm">
                            <caption className="sr-only">Lista de inscritos do informativo</caption>
                            <thead>
                                <tr className="border-b border-[var(--theme-border)] text-left text-[11px] uppercase tracking-wide text-[var(--theme-text-muted)]">
                                    {canWrite ? (
                                        <th scope="col" className="w-8 py-2">
                                            <input
                                                type="checkbox"
                                                aria-label="Selecionar todos da página"
                                                checked={allOnPageSelected}
                                                onChange={toggleAllOnPage}
                                            />
                                        </th>
                                    ) : null}
                                    <th scope="col" className="py-2">Inscrito</th>
                                    <th scope="col" className="py-2">Situação</th>
                                    <th scope="col" className="py-2">Origem</th>
                                    <th scope="col" className="py-2">Engajamento</th>
                                    <th scope="col" className="py-2">Cadastro</th>
                                    <th scope="col" className="py-2 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id} className="border-b border-[var(--theme-border)]/60 align-top">
                                        {canWrite ? (
                                            <td className="py-2">
                                                <input
                                                    type="checkbox"
                                                    aria-label={`Selecionar ${row.email}`}
                                                    checked={selected.has(row.id)}
                                                    onChange={() => toggleOne(row.id)}
                                                />
                                            </td>
                                        ) : null}

                                        <td className="py-2">
                                            <p className="text-[var(--theme-text-main)]">{row.name ?? '—'}</p>
                                            <p className="text-[11px] text-[var(--theme-text-muted)]">{row.email}</p>
                                            {row.tags.length > 0 ? (
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {row.tags.map((tag) => (
                                                        <Badge key={tag} tone="neutral">
                                                            {tag}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </td>

                                        <td className="py-2">
                                            <Badge tone={statusTone(row.status)}>
                                                {SUBSCRIBER_STATUS_LABELS[row.status] ?? row.status}
                                            </Badge>
                                        </td>

                                        <td className="py-2 text-[var(--theme-text-muted)]">
                                            {CONSENT_SOURCE_LABELS[row.source] ?? row.source}
                                        </td>

                                        <td className="py-2">
                                            <p className="text-[11px] text-[var(--theme-text-muted)]">
                                                {formatInteger(row.total_opens)} aberturas · {formatInteger(row.total_clicks)} cliques
                                            </p>
                                            <p className="text-[11px] text-[var(--theme-text-muted)]">
                                                Score {Number(row.engagement_score).toFixed(0)}
                                            </p>
                                        </td>

                                        <td className="py-2 text-[var(--theme-text-muted)]">{formatDate(row.created_at)}</td>

                                        <td className="py-2">
                                            <div className="flex flex-wrap justify-end gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                                                    onClick={() => openDetail(row)}
                                                    aria-label={`Ver histórico de ${row.email}`}
                                                >
                                                    Histórico
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
                                                    onClick={() => exportOneData(row)}
                                                    aria-label={`Exportar dados de ${row.email}`}
                                                >
                                                    LGPD
                                                </Button>
                                                {canWrite ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        onClick={() => setAnonymizeTarget(row)}
                                                        aria-label={`Anonimizar ${row.email}`}
                                                    >
                                                        Anonimizar
                                                    </Button>
                                                ) : null}
                                                {canWrite ? (
                                                    <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                                                        Editar
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Field label="Itens por página">
                        {(id) => (
                            <Select
                                id={id}
                                value={String(pageSize)}
                                onChange={(event) => {
                                    setPageSize(Number(event.target.value));
                                    setPage(1);
                                }}
                                className="w-24"
                            >
                                {PAGE_SIZES.map((size) => (
                                    <option key={size} value={size}>
                                        {size}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        total={total}
                        pageSize={pageSize}
                        onChange={setPage}
                    />
                </div>
            </Card>

            {/* Create / edit ------------------------------------------------ */}
            {(creating || editing) && canWrite ? (
                <SubscriberFormModal
                    subscriber={editing}
                    tags={tags}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                    onSaved={async () => {
                        setCreating(false);
                        setEditing(null);
                        await load();
                        await subscriberStats().then(setStats).catch(() => undefined);
                    }}
                />
            ) : null}

            {/* Timeline ----------------------------------------------------- */}
            <Modal
                open={detail !== null}
                onClose={() => setDetail(null)}
                title="Histórico de interações"
                description={detail?.row.email}
                width="lg"
            >
                {detail ? (
                    <div className="flex flex-col gap-3">
                        <div className="grid gap-2 sm:grid-cols-3">
                            <Stat label="Situação" value={SUBSCRIBER_STATUS_LABELS[detail.row.status] ?? detail.row.status} />
                            <Stat label="Aberturas" value={formatInteger(detail.row.total_opens)} />
                            <Stat label="Cliques" value={formatInteger(detail.row.total_clicks)} />
                        </div>

                        {detail.timeline.length === 0 ? (
                            <EmptyState title="Sem interações" message="Este inscrito ainda não abriu nem clicou em nenhum envio." />
                        ) : (
                            <ul className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-1">
                                {detail.timeline.map((entry) => (
                                    <li key={entry.event_id} className="rounded-lg border border-[var(--theme-border)] px-3 py-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-sm text-[var(--theme-text-main)]">{entry.event_type}</span>
                                            <span className="text-[11px] text-[var(--theme-text-muted)]">
                                                {formatDateTime(entry.occurred_at)}
                                            </span>
                                        </div>
                                        {entry.campaign_name ? (
                                            <p className="text-[11px] text-[var(--theme-text-muted)]">Campanha: {entry.campaign_name}</p>
                                        ) : null}
                                        {entry.url ? (
                                            <p className="truncate text-[11px] text-[var(--theme-text-muted)]">Link: {entry.url}</p>
                                        ) : null}
                                        {entry.reason ? (
                                            <p className="text-[11px] text-[var(--theme-text-muted)]">Motivo: {entry.reason}</p>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ) : null}
            </Modal>

            {/* CSV import ---------------------------------------------------- */}
            {importOpen ? (
                <CsvImportModal
                    tags={tags}
                    lists={lists}
                    onClose={() => setImportOpen(false)}
                    onImported={async () => {
                        setImportOpen(false);
                        await load();
                        await subscriberStats().then(setStats).catch(() => undefined);
                    }}
                />
            ) : null}

            {/* Destructive confirmations ------------------------------------ */}
            <ConfirmDialog
                open={anonymizeTarget !== null}
                title="Anonimizar titular"
                message={`Todos os dados pessoais de ${anonymizeTarget?.email ?? ''} serão destruídos de forma irreversível (LGPD art. 18, VI). Os registros estatísticos agregados são preservados. Esta ação não pode ser desfeita.`}
                confirmLabel="Anonimizar definitivamente"
                destructive
                busy={busy}
                onCancel={() => setAnonymizeTarget(null)}
                onConfirm={() => {
                    const target = anonymizeTarget;
                    if (!target) return;
                    void runBulk(async () => {
                        await anonymizeSubscriber(target.id);
                        setAnonymizeTarget(null);
                    }, 'Titular anonimizado.');
                }}
            />

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Confirmar exclusão"
                message={
                    selected.size > 1
                        ? `${selected.size} inscritos selecionados serão removidos permanentemente. Prefira "Anonimizar" quando a intenção for atender a um pedido de exclusão de dados, pois a exclusão simples pode reaparecer em uma próxima importação.`
                        : `Deseja realmente excluir ${deleteTarget?.email ?? 'este inscrito'}? Para pedidos de LGPD, use "Anonimizar".`
                }
                confirmLabel="Excluir"
                destructive
                busy={busy}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() =>
                    void runBulk(async () => {
                        await deleteSubscribers([...selected]);
                        setDeleteTarget(null);
                    }, 'Registro(s) excluído(s).')
                }
            />

            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" tabIndex={-1} aria-hidden="true" />
            {importSummary}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Subscriber create/edit
// ---------------------------------------------------------------------------

const SubscriberFormModal: React.FC<{
    subscriber: SubscriberOverviewRow | null;
    tags: NewsletterTag[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}> = ({ subscriber, tags, onClose, onSaved }) => {
    const toast = React.useContext(ToastContext);

    const [form, setForm] = useState({
        email: subscriber?.email ?? '',
        name: subscriber?.name ?? '',
        company: '',
        job_title: '',
        phone: '',
        preference_area: subscriber?.preference_area ?? 'Todas as Matérias',
        status: (subscriber?.status ?? 'active') as SubscriberStatus,
        notes: '',
    });
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [newTag, setNewTag] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!subscriber) return;

        // Load the full record (custom fields, notes, phone) plus its tags.
        void getSubscriber(subscriber.id)
            .then((full) => {
                setForm((current) => ({
                    ...current,
                    email: full.email,
                    name: full.name ?? '',
                    company: full.company ?? '',
                    job_title: full.job_title ?? '',
                    phone: full.phone ?? '',
                    preference_area: full.preference_area,
                    status: full.status,
                    notes: full.notes ?? '',
                }));
            })
            .catch(() => undefined);
    }, [subscriber]);

    const save = async () => {
        setSaving(true);
        setError(null);

        try {
            if (subscriber) {
                await updateSubscriber(subscriber.id, {
                    name: form.name || null,
                    company: form.company || null,
                    job_title: form.job_title || null,
                    phone: form.phone || null,
                    preference_area: form.preference_area,
                    status: form.status,
                    notes: form.notes || null,
                });
                await setSubscriberTags(subscriber.id, selectedTags);
                toast.push('Inscrito atualizado.', 'success');
            } else {
                const created = await createSubscriber({
                    email: form.email,
                    name: form.name || null,
                    company: form.company || null,
                    job_title: form.job_title || null,
                    phone: form.phone || null,
                    preference_area: form.preference_area,
                    status: form.status,
                    source: 'admin_import',
                    notes: form.notes || null,
                });
                if (selectedTags.length > 0) await setSubscriberTags(created.id, selectedTags);
                toast.push('Inscrito criado.', 'success');
            }

            await onSaved();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'falha ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const addTag = async () => {
        if (!newTag.trim()) return;
        try {
            const tag = await createTag(newTag.trim());
            setSelectedTags((current) => [...current, tag.id]);
            setNewTag('');
            toast.push(`Tag "${tag.name}" criada.`, 'success');
        } catch (tagError) {
            toast.push(tagError instanceof Error ? tagError.message : 'falha ao criar tag', 'error');
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={subscriber ? 'Editar inscrito' : 'Novo inscrito'}
            description={
                subscriber
                    ? 'Alterações de situação são registradas na trilha de auditoria.'
                    : 'O registro é criado como ativo, com consentimento registrado no momento do cadastro.'
            }
            footer={
                <>
                    <Button onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={save} loading={saving}>
                        Salvar
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {error ? <Alert tone="error">{error}</Alert> : null}

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="E-mail" required>
                        {(id) => (
                            <Input
                                id={id}
                                type="email"
                                value={form.email}
                                disabled={Boolean(subscriber)}
                                onChange={(event) => setForm({ ...form, email: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label="Nome">
                        {(id) => (
                            <Input id={id} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                        )}
                    </Field>

                    <Field label="Empresa">
                        {(id) => (
                            <Input
                                id={id}
                                value={form.company}
                                onChange={(event) => setForm({ ...form, company: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label="Cargo">
                        {(id) => (
                            <Input
                                id={id}
                                value={form.job_title}
                                onChange={(event) => setForm({ ...form, job_title: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label="Telefone">
                        {(id) => (
                            <Input id={id} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                        )}
                    </Field>

                    <Field label="Área de interesse">
                        {(id) => (
                            <Input
                                id={id}
                                value={form.preference_area}
                                onChange={(event) => setForm({ ...form, preference_area: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label="Situação">
                        {(id) => (
                            <Select
                                id={id}
                                value={form.status}
                                onChange={(event) => setForm({ ...form, status: event.target.value as SubscriberStatus })}
                            >
                                {Object.entries(SUBSCRIBER_STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>
                </div>

                <Field label="Observações internas" hint="Não é enviado ao inscrito.">
                    {(id) => (
                        <Textarea id={id} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
                    )}
                </Field>

                <fieldset className="rounded-lg border border-[var(--theme-border)] p-3">
                    <legend className="px-1 text-xs text-[var(--theme-text-muted)]">Tags</legend>
                    <div className="flex flex-wrap gap-2">
                        {tags.length === 0 ? (
                            <p className="text-xs text-[var(--theme-text-muted)]">Nenhuma tag criada ainda.</p>
                        ) : (
                            tags.map((tag) => {
                                const checked = selectedTags.includes(tag.id);
                                return (
                                    <label
                                        key={tag.id}
                                        className={cn(
                                            'flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                                            checked
                                                ? 'border-[var(--theme-gold)] text-[var(--theme-gold)]'
                                                : 'border-[var(--theme-border)] text-[var(--theme-text-muted)]',
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() =>
                                                setSelectedTags((current) =>
                                                    checked ? current.filter((id) => id !== tag.id) : [...current, tag.id],
                                                )
                                            }
                                        />
                                        {tag.name}
                                    </label>
                                );
                            })
                        )}
                    </div>

                    <div className="mt-3 flex gap-2">
                        <Input
                            value={newTag}
                            placeholder="nova tag"
                            aria-label="Nome da nova tag"
                            onChange={(event) => setNewTag(event.target.value)}
                        />
                        <Button size="sm" onClick={addTag}>
                            Adicionar
                        </Button>
                    </div>
                </fieldset>
            </div>
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const CsvImportModal: React.FC<{
    tags: NewsletterTag[];
    lists: NewsletterList[];
    onClose: () => void;
    onImported: () => Promise<void>;
}> = ({ tags, lists, onClose, onImported }) => {
    const toast = React.useContext(ToastContext);

    const [content, setContent] = useState('');
    const [listId, setListId] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [importing, setImporting] = useState(false);
    const [outcome, setOutcome] = useState<{
        inserted: number;
        failed: { row: number; email: string; reason: string }[];
    } | null>(null);

    const parsed = useMemo(() => (content.trim() ? parseCsv(content) : null), [content]);
    const preview = useMemo(() => (parsed ? mapImportRows(parsed) : null), [parsed]);

    const onFile = async (file: File) => {
        const text = await file.text();
        setContent(text);
    };

    const runImport = async () => {
        if (!preview) return;

        setImporting(true);
        try {
            const result = await importSubscribers(preview.mapped, {
                source: 'admin_import',
                listId: listId || null,
                tagIds: selectedTags,
            });

            setOutcome(result);
            toast.push(`${result.inserted} inscrito(s) importado(s).`, result.inserted > 0 ? 'success' : 'info');
        } catch (importError) {
            toast.push(importError instanceof Error ? importError.message : 'falha na importação', 'error');
        } finally {
            setImporting(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Importar inscritos"
            description="Aceita CSV com cabeçalho. Colunas reconhecidas: email, nome, empresa, cargo, área, telefone."
            width="lg"
            footer={
                <>
                    <Button onClick={onClose} disabled={importing}>
                        {outcome ? 'Concluir' : 'Cancelar'}
                    </Button>
                    {outcome ? null : (
                        <Button
                            variant="primary"
                            onClick={runImport}
                            loading={importing}
                            disabled={!preview || preview.validCount === 0}
                        >
                            Importar {preview ? preview.validCount : 0} registro(s)
                        </Button>
                    )}
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {outcome ? (
                    <div className="flex flex-col gap-3">
                        <Alert tone={outcome.inserted > 0 ? 'success' : 'info'}>
                            {outcome.inserted} registro(s) gravado(s). {outcome.failed.length} não foram aplicados.
                        </Alert>

                        {outcome.failed.length > 0 ? (
                            <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--theme-border)]">
                                <table className="w-full text-xs">
                                    <caption className="sr-only">Registros não importados</caption>
                                    <thead>
                                        <tr className="border-b border-[var(--theme-border)] text-left text-[var(--theme-text-muted)]">
                                            <th scope="col" className="px-2 py-1">Linha</th>
                                            <th scope="col" className="px-2 py-1">E-mail</th>
                                            <th scope="col" className="px-2 py-1">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {outcome.failed.map((failure, index) => (
                                            <tr key={`${failure.row}-${index}`} className="border-b border-[var(--theme-border)]/50">
                                                <td className="px-2 py-1">{failure.row}</td>
                                                <td className="px-2 py-1">{failure.email || '—'}</td>
                                                <td className="px-2 py-1 text-[var(--theme-text-muted)]">{failure.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="cursor-pointer rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-text-main)] hover:border-[var(--theme-gold)]">
                                Escolher arquivo CSV
                                <input
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) void onFile(file);
                                    }}
                                />
                            </label>
                            <span className="text-xs text-[var(--theme-text-muted)]">ou cole o conteúdo abaixo</span>
                        </div>

                        <Textarea
                            value={content}
                            aria-label="Conteúdo CSV"
                            placeholder={'email,nome,empresa\ncontato@empresa.com,Maria Souza,Empresa S/A'}
                            onChange={(event) => setContent(event.target.value)}
                            className="min-h-[140px] font-mono text-xs"
                        />

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Adicionar à lista">
                                {(id) => (
                                    <Select id={id} value={listId} onChange={(event) => setListId(event.target.value)}>
                                        <option value="">Não adicionar</option>
                                        {lists.map((list) => (
                                            <option key={list.id} value={list.id}>
                                                {list.name}
                                            </option>
                                        ))}
                                    </Select>
                                )}
                            </Field>

                            <Field label="Aplicar tags">
                                {(id) => (
                                    <Select
                                        id={id}
                                        value=""
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            if (value && !selectedTags.includes(value)) setSelectedTags([...selectedTags, value]);
                                        }}
                                    >
                                        <option value="">Selecionar…</option>
                                        {tags.map((tag) => (
                                            <option key={tag.id} value={tag.id}>
                                                {tag.name}
                                            </option>
                                        ))}
                                    </Select>
                                )}
                            </Field>
                        </div>

                        {selectedTags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                                {selectedTags.map((id) => {
                                    const tag = tags.find((entry) => entry.id === id);
                                    return (
                                        <Badge key={id} tone="gold">
                                            {tag?.name ?? id}
                                        </Badge>
                                    );
                                })}
                            </div>
                        ) : null}

                        {parsed && parsed.errors.length > 0 ? (
                            <Alert tone="error">
                                <p className="font-medium">Problemas no arquivo:</p>
                                <ul className="mt-1 list-inside list-disc">
                                    {parsed.errors.slice(0, 5).map((issue, index) => (
                                        <li key={index}>{issue}</li>
                                    ))}
                                </ul>
                            </Alert>
                        ) : null}

                        {preview ? (
                            <div className="grid gap-2 sm:grid-cols-3">
                                <Stat label="Válidos" value={formatInteger(preview.validCount)} tone="success" />
                                <Stat label="Inválidos" value={formatInteger(preview.invalidCount)} tone={preview.invalidCount > 0 ? 'danger' : 'neutral'} />
                                <Stat label="Repetidos no arquivo" value={formatInteger(preview.duplicateInFileCount)} tone="warning" />
                            </div>
                        ) : null}

                        {preview && preview.unmappedColumns.length > 0 ? (
                            <p className="text-xs text-[var(--theme-text-muted)]">
                                Colunas ignoradas (não reconhecidas): {preview.unmappedColumns.join(', ')}
                            </p>
                        ) : null}

                        {preview && preview.validCount > 0 ? (
                            <div className="max-h-52 overflow-y-auto rounded-lg border border-[var(--theme-border)]">
                                <table className="w-full text-xs">
                                    <caption className="sr-only">Prévia da importação</caption>
                                    <thead>
                                        <tr className="border-b border-[var(--theme-border)] text-left text-[var(--theme-text-muted)]">
                                            <th scope="col" className="px-2 py-1">Linha</th>
                                            <th scope="col" className="px-2 py-1">E-mail</th>
                                            <th scope="col" className="px-2 py-1">Nome</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.mapped.slice(0, 50).map((row) => (
                                            <tr key={row.__row} className="border-b border-[var(--theme-border)]/50">
                                                <td className="px-2 py-1">{row.__row}</td>
                                                <td className="px-2 py-1">{row.email}</td>
                                                <td className="px-2 py-1 text-[var(--theme-text-muted)]">{row.name ?? '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default SubscribersManager;
