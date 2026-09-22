/**
 * List management screen for the Informativo module.
 *
 * Three responsibilities, deliberately kept in one file so the import wizard
 * can share the list selection state with the member table:
 *
 *   1. Lists      — create/edit/archive, kind, visibility, opt-in, default.
 *   2. Members    — paginated membership with add/remove/unsubscribe and CSV.
 *   3. Import     — file or paste, field mapping, validation, progress, report.
 *
 * The wizard never writes anything until the operator confirms the mapping and
 * the preview, so a mis-detected delimiter cannot silently corrupt a list.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, Download, Plus, RefreshCw, Star, Upload, UserPlus } from 'lucide-react';
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
    Toggle,
    cn,
} from './ui';
import {
    CONSENT_SOURCE_LABELS,
    IMPORT_STATUS_LABELS,
    LIST_KIND_HINTS,
    LIST_KIND_LABELS,
    LIST_OPT_IN_LABELS,
    LIST_VISIBILITY_LABELS,
    SUBSCRIBER_STATUS_LABELS,
    type NewsletterImportJob,
    type NewsletterList,
    type NewsletterListKind,
    type NewsletterListMember,
    type NewsletterListOptIn,
    type NewsletterListStats,
    type NewsletterListVisibility,
    type SubscriberStatus,
} from '../../../types/newsletter';
import {
    archiveManagedList,
    createManagedList,
    fetchListMembersForExport,
    listListMembers,
    listStats,
    searchSubscribersNotInList,
    setDefaultList,
    syncCrmContacts,
    syncListMembers,
    updateManagedList,
} from '../../../lib/newsletter/lists';
import { downloadCsv, toCsv } from '../../../lib/newsletter/csv';
import { formatDateTime, formatInteger } from '../../../lib/newsletter/client';
import { ImportHistoryPanel, ImportWizardModal } from './ListsImportWizard';

const PAGE_SIZE = 25;

function kindTone(
    kind: NewsletterListKind,
): 'gold' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' {
    switch (kind) {
        case 'email':
            return 'gold';
        case 'lead':
            return 'info';
        case 'engagement':
            return 'success';
        case 'suppression':
            return 'danger';
        case 'partner':
            return 'warning';
        default:
            return 'neutral';
    }
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ListsManagerProps {
    canWrite: boolean;
    lists: NewsletterList[];
    onReload: () => Promise<void>;
}

function toggleSetItem(current: Set<string>, id: string): Set<string> {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

function getSubscriberStatusTone(status: SubscriberStatus): 'success' | 'warning' | 'neutral' {
    if (status === 'active') return 'success';
    if (status === 'pending') return 'warning';
    return 'neutral';
}

interface ListDetailsViewProps {
    selected: NewsletterList;
    statsById: Map<string, NewsletterListStats>;
    canWrite: boolean;
    onImport: (list: NewsletterList) => void;
    onAddMembers: (list: NewsletterList) => void;
    onEdit: (list: NewsletterList) => void;
    onSetDefault: (listId: string) => void;
    onArchive: (list: NewsletterList) => void;
}

const ListDetailsView: React.FC<ListDetailsViewProps> = ({
    selected,
    statsById,
    canWrite,
    onImport,
    onAddMembers,
    onEdit,
    onSetDefault,
    onArchive,
}) => {
    const listStats = statsById.get(selected.id);
    const memberCount = formatInteger(listStats?.member_count ?? selected.member_count);
    const activeCount = formatInteger(listStats?.active_count ?? selected.active_count);
    const pendingCount = formatInteger(listStats?.pending_count ?? 0);
    const unsubscribedCount = formatInteger(listStats?.unsubscribed_count ?? 0);

    const importStatusLabel = listStats?.last_import_status
        ? IMPORT_STATUS_LABELS[listStats.last_import_status as NewsletterImportJob['status']]
        : '—';

    return (
        <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Membros" value={memberCount} />
                <Stat label="Ativos" value={activeCount} tone="success" />
                <Stat label="Pendentes" value={pendingCount} tone="warning" />
                <Stat label="Descadastrados" value={unsubscribedCount} tone="danger" />
            </div>

            <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-2 border-b border-[var(--theme-border)]/60 py-1">
                    <dt className="text-[var(--theme-text-muted)]">Visibilidade</dt>
                    <dd>{LIST_VISIBILITY_LABELS[selected.visibility]}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-[var(--theme-border)]/60 py-1">
                    <dt className="text-[var(--theme-text-muted)]">Consentimento</dt>
                    <dd>{LIST_OPT_IN_LABELS[selected.opt_in_policy]}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-[var(--theme-border)]/60 py-1">
                    <dt className="text-[var(--theme-text-muted)]">Última importação</dt>
                    <dd>
                        {selected.last_import_at
                            ? formatDateTime(selected.last_import_at)
                            : '—'}
                    </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-[var(--theme-border)]/60 py-1">
                    <dt className="text-[var(--theme-text-muted)]">Situação da importação</dt>
                    <dd>{importStatusLabel}</dd>
                </div>
            </dl>

            <p className="text-xs text-[var(--theme-text-muted)]">
                {LIST_KIND_HINTS[selected.kind]}
            </p>

            <div className="flex flex-wrap gap-2">
                {canWrite ? (
                    <>
                        <Button
                            size="sm"
                            variant="primary"
                            icon={<Upload className="h-3.5 w-3.5" />}
                            onClick={() => onImport(selected)}
                        >
                            Importar contatos
                        </Button>
                        <Button
                            size="sm"
                            icon={<UserPlus className="h-3.5 w-3.5" />}
                            onClick={() => onAddMembers(selected)}
                        >
                            Adicionar membros
                        </Button>
                        <Button size="sm" onClick={() => onEdit(selected)}>
                            Editar
                        </Button>
                        {!selected.is_default ? (
                            <Button
                                size="sm"
                                onClick={() => onSetDefault(selected.id)}
                            >
                                Tornar padrão
                            </Button>
                        ) : null}
                        <Button
                            size="sm"
                            variant="danger"
                            icon={<Archive className="h-3.5 w-3.5" />}
                            onClick={() => onArchive(selected)}
                        >
                            Arquivar
                        </Button>
                    </>
                ) : null}
            </div>
        </div>
    );
};

export const ListsManager: React.FC<ListsManagerProps> = ({ canWrite, lists, onReload }) => {
    const [selectedId, setSelectedId] = useState<string | null>(lists[0]?.id ?? null);
    const [stats, setStats] = useState<NewsletterListStats[]>([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<NewsletterList | null>(null);
    const [archiving, setArchiving] = useState<NewsletterList | null>(null);
    const [importing, setImporting] = useState<NewsletterList | null>(null);
    const [addingMembers, setAddingMembers] = useState<NewsletterList | null>(null);
    const [syncing, setSyncing] = useState(false);

    const selected = useMemo(
        () => lists.find((list) => list.id === selectedId) ?? lists[0] ?? null,
        [lists, selectedId],
    );

    const loadStats = useCallback(async () => {
        setStatsLoading(true);
        try {
            setStats(await listStats());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao carregar os contadores.');
        } finally {
            setStatsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStats();
    }, [loadStats]);

    useEffect(() => {
        if (!selectedId && lists.length > 0) setSelectedId(lists[0].id);
    }, [lists, selectedId]);

    const statsById = useMemo(() => {
        const map = new Map<string, NewsletterListStats>();
        stats.forEach((entry) => map.set(entry.list_id, entry));
        return map;
    }, [stats]);

    const reloadAll = useCallback(async () => {
        await onReload();
        await loadStats();
    }, [onReload, loadStats]);

    const handleSyncCrm = async () => {
        setSyncing(true);
        setError(null);
        try {
            const result = await syncCrmContacts(500);
            setNotice(
                `${formatInteger(result.linked)} inscrito(s) vinculado(s) ao CRM. ` +
                `Total de contatos: ${formatInteger(result.contacts_total)}.`,
            );
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao sincronizar o CRM.');
        } finally {
            setSyncing(false);
        }
    };

    const handleSetDefault = async (listId: string) => {
        try {
            await setDefaultList(listId);
            await reloadAll();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao definir a lista padrão.');
        }
    };

    const handleConfirmArchive = async () => {
        const target = archiving;
        setArchiving(null);
        if (!target) return;
        try {
            await archiveManagedList(target.id);
            if (selectedId === target.id) setSelectedId(null);
            await reloadAll();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao arquivar a lista.');
        }
    };

    return (
        <div className="flex flex-col gap-5">
            {error ? <Alert tone="error">{error}</Alert> : null}
            {notice ? <Alert tone="success">{notice}</Alert> : null}

            <Card
                title="Listas"
                subtitle="Tipos de lista, visibilidade e política de consentimento."
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            icon={<RefreshCw className="h-3.5 w-3.5" />}
                            loading={syncing}
                            onClick={() => void handleSyncCrm()}
                        >
                            Sincronizar CRM
                        </Button>
                        {canWrite ? (
                            <Button
                                size="sm"
                                variant="primary"
                                icon={<Plus className="h-3.5 w-3.5" />}
                                onClick={() => setCreating(true)}
                            >
                                Nova lista
                            </Button>
                        ) : null}
                    </div>
                }
            >
                {lists.length === 0 ? (
                    <EmptyState
                        title="Nenhuma lista"
                        message="Crie a primeira lista para começar a organizar os contatos."
                    />
                ) : (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                        <ul className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
                            {lists.map((list) => {
                                const entry = statsById.get(list.id);
                                const active = selected?.id === list.id;
                                return (
                                    <li key={list.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(list.id)}
                                            aria-current={active ? 'true' : undefined}
                                            className={cn(
                                                'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                                                active
                                                    ? 'border-[var(--theme-gold)] bg-[var(--theme-surface)]'
                                                    : 'border-[var(--theme-border)] hover:border-[var(--theme-gold)]',
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="truncate text-sm font-medium text-[var(--theme-text-main)]">
                                                    {list.name}
                                                </span>
                                                {list.is_default ? (
                                                    <Star
                                                        className="h-3.5 w-3.5 shrink-0 text-[var(--theme-gold)]"
                                                        aria-label="Lista padrão"
                                                    />
                                                ) : null}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <Badge tone={kindTone(list.kind)}>
                                                    {LIST_KIND_LABELS[list.kind]}
                                                </Badge>
                                                <span className="text-[11px] text-[var(--theme-text-muted)]">
                                                    {formatInteger(entry?.member_count ?? list.member_count)} membros
                                                </span>
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        <div className="flex flex-col gap-4">
                            {selected ? (
                                <ListDetailsView
                                    selected={selected}
                                    statsById={statsById}
                                    canWrite={canWrite}
                                    onImport={setImporting}
                                    onAddMembers={setAddingMembers}
                                    onEdit={setEditing}
                                    onSetDefault={(id) => void handleSetDefault(id)}
                                    onArchive={setArchiving}
                                />
                            ) : (
                                <EmptyState
                                    title="Selecione uma lista"
                                    message="Escolha uma lista à esquerda para ver os detalhes."
                                />
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {selected ? (
                <MembersPanel
                    key={selected.id}
                    list={selected}
                    canWrite={canWrite}
                    onChanged={reloadAll}
                    onError={setError}
                />
            ) : null}

            {selected ? (
                <ImportHistoryPanel key={`history-${selected.id}`} list={selected} onError={setError} />
            ) : null}

            {creating || editing ? (
                <ListFormModal
                    list={editing}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                    onSaved={async () => {
                        setCreating(false);
                        setEditing(null);
                        await reloadAll();
                    }}
                />
            ) : null}

            {importing ? (
                <ImportWizardModal
                    list={importing}
                    onClose={() => setImporting(null)}
                    onDone={async () => {
                        setImporting(null);
                        await reloadAll();
                    }}
                />
            ) : null}

            {addingMembers ? (
                <AddMembersModal
                    list={addingMembers}
                    onClose={() => setAddingMembers(null)}
                    onDone={async () => {
                        setAddingMembers(null);
                        await reloadAll();
                    }}
                />
            ) : null}

            <ConfirmDialog
                open={archiving !== null}
                title="Arquivar lista"
                message={
                    archiving
                        ? `A lista "${archiving.name}" será arquivada. Os membros e o histórico são preservados.`
                        : ''
                }
                confirmLabel="Arquivar"
                destructive
                onCancel={() => setArchiving(null)}
                onConfirm={() => void handleConfirmArchive()}
            />

            {statsLoading ? <Spinner label="Atualizando contadores" /> : null}
        </div>
    );
};

// ---------------------------------------------------------------------------
// List form
// ---------------------------------------------------------------------------

const ListFormModal: React.FC<{
    list: NewsletterList | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
}> = ({ list, onClose, onSaved }) => {
    const [name, setName] = useState(list?.name ?? '');
    const [description, setDescription] = useState(list?.description ?? '');
    const [kind, setKind] = useState<NewsletterListKind>(list?.kind ?? 'email');
    const [visibility, setVisibility] = useState<NewsletterListVisibility>(list?.visibility ?? 'shared');
    const [optIn, setOptIn] = useState<NewsletterListOptIn>(list?.opt_in_policy ?? 'double');
    const [color, setColor] = useState(list?.color ?? '#D4AF37');
    const [doubleOptIn, setDoubleOptIn] = useState(list?.double_opt_in ?? true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        if (!name.trim()) {
            setError('Informe um nome para a lista.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            if (list) {
                await updateManagedList(list.id, {
                    name: name.trim(),
                    description: description.trim() || null,
                    kind,
                    visibility,
                    opt_in_policy: optIn,
                    color,
                    double_opt_in: doubleOptIn,
                });
            } else {
                await createManagedList({
                    name,
                    description: description.trim() || null,
                    kind,
                    visibility,
                    optInPolicy: optIn,
                    color,
                    doubleOptIn,
                });
            }
            await onSaved();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao salvar a lista.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={list ? 'Editar lista' : 'Nova lista'}
            description="O tipo define como a lista é usada nas campanhas e nos relatórios."
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" loading={busy} onClick={() => void save()}>
                        Salvar
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                {error ? <Alert tone="error">{error}</Alert> : null}

                <Field label="Nome" required>
                    {(id) => (
                        <Input
                            id={id}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Boletim jurídico"
                        />
                    )}
                </Field>

                <Field label="Descrição">
                    {(id) => (
                        <Textarea
                            id={id}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Para que serve esta lista"
                        />
                    )}
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Tipo" hint={LIST_KIND_HINTS[kind]}>
                        {(id) => (
                            <Select
                                id={id}
                                value={kind}
                                onChange={(event) => setKind(event.target.value as NewsletterListKind)}
                            >
                                {Object.entries(LIST_KIND_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Visibilidade">
                        {(id) => (
                            <Select
                                id={id}
                                value={visibility}
                                onChange={(event) =>
                                    setVisibility(event.target.value as NewsletterListVisibility)
                                }
                            >
                                {Object.entries(LIST_VISIBILITY_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Política de consentimento">
                        {(id) => (
                            <Select
                                id={id}
                                value={optIn}
                                onChange={(event) => setOptIn(event.target.value as NewsletterListOptIn)}
                            >
                                {Object.entries(LIST_OPT_IN_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Cor">
                        {(id) => (
                            <Input
                                id={id}
                                type="color"
                                value={color}
                                onChange={(event) => setColor(event.target.value)}
                            />
                        )}
                    </Field>
                </div>

                <Toggle
                    checked={doubleOptIn}
                    onChange={setDoubleOptIn}
                    label="Exigir confirmação por e-mail (double opt-in)"
                    hint="Recomendado para listas alimentadas pelo site."
                />
            </div>
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const MembersPanel: React.FC<{
    list: NewsletterList;
    canWrite: boolean;
    onChanged: () => Promise<void>;
    onError: (message: string) => void;
}> = ({ list, canWrite, onChanged, onError }) => {
    const [rows, setRows] = useState<NewsletterListMember[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<SubscriberStatus | ''>('');
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listListMembers({
                listId: list.id,
                page,
                pageSize: PAGE_SIZE,
                search: search || undefined,
                status: status || null,
            });
            setRows(result.rows);
            setTotal(result.total);
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Falha ao carregar os membros.');
        } finally {
            setLoading(false);
        }
    }, [list.id, page, search, status, onError]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 200);
        return () => window.clearTimeout(timer);
    }, [load]);

    useEffect(() => {
        setSelected(new Set());
    }, [list.id, page]);

    const toggleOne = (id: string) => {
        setSelected((current) => toggleSetItem(current, id));
    };

    const toggleAll = () => {
        setSelected((current) => {
            if (current.size === rows.length) return new Set();
            return new Set(rows.map((row) => row.subscriber_id));
        });
    };

    const applyAction = async (action: 'remove' | 'unsubscribe') => {
        if (selected.size === 0) return;
        setBusy(true);
        setFeedback(null);
        try {
            const result = await syncListMembers(list.id, Array.from(selected), action);
            setSelected(new Set());
            await load();
            await onChanged();
            setFeedback(
                action === 'remove'
                    ? `${result.affected} membro(s) removido(s) da lista.`
                    : `${result.affected} membro(s) descadastrado(s).`,
            );
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Falha ao atualizar os membros.');
        } finally {
            setBusy(false);
        }
    };

    const exportCsv = async () => {
        setBusy(true);
        try {
            const all = await fetchListMembersForExport(list.id);
            const content = toCsv(
                ['email', 'nome', 'empresa', 'cargo', 'situacao', 'origem', 'entrou_em'],
                all.map((row) => [
                    row.email,
                    row.name,
                    row.company,
                    row.job_title,
                    SUBSCRIBER_STATUS_LABELS[row.status],
                    CONSENT_SOURCE_LABELS[row.source],
                    row.joined_at,
                ]),
            );
            downloadCsv(`lista-${list.slug}-membros.csv`, content);
        } catch (cause) {
            onError(cause instanceof Error ? cause.message : 'Falha ao exportar os membros.');
        } finally {
            setBusy(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const renderMembersTable = () => {
        if (loading && rows.length === 0) {
            return <Spinner label="Carregando membros" />;
        }
        if (rows.length === 0) {
            return (
                <EmptyState
                    title="Nenhum membro"
                    message="Importe contatos ou adicione inscritos existentes a esta lista."
                />
            );
        }
        return (
            <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                    <tr className="border-b border-[var(--theme-border)] text-left text-[11px] uppercase tracking-wide text-[var(--theme-text-muted)]">
                        {canWrite ? (
                            <th scope="col" className="w-8 py-2">
                                <input
                                    type="checkbox"
                                    aria-label="Selecionar todos"
                                    checked={selected.size === rows.length && rows.length > 0}
                                    onChange={toggleAll}
                                />
                            </th>
                        ) : null}
                        <th scope="col" className="py-2">
                            E-mail
                        </th>
                        <th scope="col" className="py-2">
                            Nome
                        </th>
                        <th scope="col" className="py-2">
                            Empresa
                        </th>
                        <th scope="col" className="py-2">
                            Situação
                        </th>
                        <th scope="col" className="py-2">
                            Entrou em
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr
                            key={row.subscriber_id}
                            className="border-b border-[var(--theme-border)]/60"
                        >
                            {canWrite ? (
                                <td className="py-2">
                                    <input
                                        type="checkbox"
                                        aria-label={`Selecionar ${row.email}`}
                                        checked={selected.has(row.subscriber_id)}
                                        onChange={() => toggleOne(row.subscriber_id)}
                                    />
                                </td>
                            ) : null}
                            <td className="py-2">{row.email}</td>
                            <td className="py-2">{row.name ?? '—'}</td>
                            <td className="py-2">{row.company ?? '—'}</td>
                            <td className="py-2">
                                <Badge tone={getSubscriberStatusTone(row.status)}>
                                    {SUBSCRIBER_STATUS_LABELS[row.status]}
                                </Badge>
                            </td>
                            <td className="py-2 text-xs text-[var(--theme-text-muted)]">
                                {formatDateTime(row.joined_at)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    };

    return (
        <Card
            title={`Membros — ${list.name}`}
            subtitle="Quem recebe esta lista e em que situação."
            actions={
                <Button
                    size="sm"
                    icon={<Download className="h-3.5 w-3.5" />}
                    loading={busy}
                    onClick={() => void exportCsv()}
                >
                    Exportar CSV
                </Button>
            }
        >
            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Buscar">
                    {(id) => (
                        <Input
                            id={id}
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder="e-mail"
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
                <div className="flex items-end">
                    <Button
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        loading={loading}
                        onClick={() => void load()}
                    >
                        Atualizar
                    </Button>
                </div>
            </div>

            {feedback ? (
                <div className="mt-3">
                    <Alert tone="success">{feedback}</Alert>
                </div>
            ) : null}

            {canWrite && selected.size > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--theme-gold)] bg-[var(--theme-surface)] px-3 py-2">
                    <span className="text-xs text-[var(--theme-text-muted)]">
                        {selected.size} selecionado(s)
                    </span>
                    <Button size="sm" loading={busy} onClick={() => void applyAction('unsubscribe')}>
                        Descadastrar da lista
                    </Button>
                    <Button
                        size="sm"
                        variant="danger"
                        loading={busy}
                        onClick={() => void applyAction('remove')}
                    >
                        Remover da lista
                    </Button>
                </div>
            ) : null}

            <div className="mt-4 overflow-x-auto">
                {renderMembersTable()}
            </div>

            <div className="mt-3">
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                />
            </div>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Add members
// ---------------------------------------------------------------------------

const AddMembersModal: React.FC<{
    list: NewsletterList;
    onClose: () => void;
    onDone: () => Promise<void>;
}> = ({ list, onClose, onDone }) => {
    const [search, setSearch] = useState('');
    const [options, setOptions] = useState<{ id: string; email: string; name: string | null }[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setOptions(await searchSubscribersNotInList(list.id, search, 25));
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao buscar inscritos.');
        } finally {
            setLoading(false);
        }
    }, [list.id, search]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 200);
        return () => window.clearTimeout(timer);
    }, [load]);

    const toggle = (id: string) => {
        setSelected((current) => toggleSetItem(current, id));
    };

    const save = async () => {
        if (selected.size === 0) return;
        setBusy(true);
        setError(null);
        try {
            await syncListMembers(list.id, Array.from(selected), 'add');
            await onDone();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Falha ao adicionar os membros.');
        } finally {
            setBusy(false);
        }
    };

    const renderOptions = () => {
        if (loading) {
            return <Spinner label="Buscando" />;
        }
        if (options.length === 0) {
            return (
                <EmptyState
                    title="Nenhum resultado"
                    message="Todos os inscritos encontrados já pertencem a esta lista."
                />
            );
        }
        return (
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-[var(--theme-border)]">
                {options.map((option) => (
                    <li
                        key={option.id}
                        className="flex items-center gap-2 border-b border-[var(--theme-border)]/60 px-3 py-2 last:border-b-0"
                    >
                        <input
                            type="checkbox"
                            id={`add-${option.id}`}
                            checked={selected.has(option.id)}
                            onChange={() => toggle(option.id)}
                        />
                        <label htmlFor={`add-${option.id}`} className="flex-1 cursor-pointer text-sm">
                            <span className="block text-[var(--theme-text-main)]">{option.email}</span>
                            {option.name ? (
                                <span className="block text-[11px] text-[var(--theme-text-muted)]">
                                    {option.name}
                                </span>
                            ) : null}
                        </label>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={`Adicionar membros — ${list.name}`}
            description="Busque inscritos que ainda não pertencem a esta lista."
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>Cancelar</Button>
                    <Button
                        variant="primary"
                        loading={busy}
                        disabled={selected.size === 0}
                        onClick={() => void save()}
                    >
                        Adicionar {selected.size > 0 ? `(${selected.size})` : ''}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-3">
                {error ? <Alert tone="error">{error}</Alert> : null}

                <Field label="Buscar por e-mail">
                    {(id) => (
                        <Input
                            id={id}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="nome@exemplo.com"
                        />
                    )}
                </Field>

                {renderOptions()}
            </div>
        </Modal>
    );
};
