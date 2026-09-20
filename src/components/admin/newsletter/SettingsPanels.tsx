/**
 * Audiences (lists, segments, templates) and settings (providers, global
 * configuration, audit trail, admin users).
 *
 * Provider credentials are never entered here: only the *name* of the Edge
 * Function secret is stored in the database. The form says so explicitly so an
 * operator does not paste an API key into a field that would persist it in
 * plain text.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import type {
    AdminProfile,
    AdminRole,
    AuditLogEntry,
    NewsletterList,
    NewsletterProvider,
    NewsletterSegment,
    NewsletterSettings,
    NewsletterTemplate,
    ProviderKind,
    SegmentCondition,
} from '../../../types/newsletter';
import { ADMIN_ROLE_LABELS, PROVIDER_LABELS } from '../../../types/newsletter';
import {
    SEGMENT_FIELDS,
    SEGMENT_OPERATORS,
    countSegment,
    createAdminUser,
    createList,
    createProvider,
    createSegment,
    deleteAdminUser,
    deleteList,
    deleteProvider,
    deleteSegment,
    generateRecoveryLink,
    getSettings,
    listAdminUsers,
    listAuditLogs,
    listLists,
    listProviders,
    listSegments,
    previewSegment,
    setAdminUserActive,
    setAdminUserRole,
    setDefaultProvider,
    updateList,
    updateProvider,
    updateSegment,
    updateSettings,
} from '../../../lib/newsletter/config';
// Templates live with the campaign module, since applying one copies blocks
// straight into a campaign.
import {
    createTemplate,
    deleteTemplate,
    listTemplates,
    updateTemplate,
} from '../../../lib/newsletter/campaigns';
import { formatDateTime, formatInteger } from '../../../lib/newsletter/client';
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
    Select,
    Spinner,
    Stat,
    Tabs,
    Textarea,
    Toggle,
    ToastContext,
} from './ui';

export interface SettingsPanelsProps {
    section: 'audiences' | 'settings';
    role: AdminRole | null;
    canWrite: boolean;
    canAdmin: boolean;
    lists: NewsletterList[];
    segments: NewsletterSegment[];
    onReloadAudiences: () => Promise<void>;
}

export const SettingsPanels: React.FC<SettingsPanelsProps> = ({
    section,
    role,
    canWrite,
    canAdmin,
    lists,
    segments,
    onReloadAudiences,
}) => {
    if (section === 'audiences') {
        return (
            <div className="flex flex-col gap-5">
                <ListsPanel canWrite={canWrite} lists={lists} onReload={onReloadAudiences} />
                <SegmentsPanel canWrite={canWrite} segments={segments} lists={lists} onReload={onReloadAudiences} />
                <TemplatesPanel canWrite={canWrite} />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            <ProvidersPanel canAdmin={canAdmin} />
            <GlobalSettingsPanel canAdmin={canAdmin} lists={lists} />
            <AuditPanel canAdmin={canAdmin} />
            <AdminUsersPanel canAdmin={canAdmin} role={role} />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const ListsPanel: React.FC<{ canWrite: boolean; lists: NewsletterList[]; onReload: () => Promise<void> }> = ({
    canWrite,
    lists,
    onReload,
}) => {
    const toast = React.useContext(ToastContext);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<NewsletterList | null>(null);

    const create = async () => {
        if (!name.trim()) {
            toast.push('Informe um nome para a lista.', 'error');
            return;
        }

        setBusy(true);
        try {
            await createList({ name, description: description || null });
            setName('');
            setDescription('');
            toast.push('Lista criada.', 'success');
            await onReload();
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao criar lista', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card
            title="Listas"
            subtitle="Agrupamentos de inscritos usados como público das campanhas. Uma lista pode ser marcada como padrão."
        >
            {canWrite ? (
                <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_auto]">
                    <Field label="Nome">
                        {(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
                    </Field>
                    <Field label="Descrição">
                        {(id) => (
                            <Input id={id} value={description} onChange={(event) => setDescription(event.target.value)} />
                        )}
                    </Field>
                    <div className="flex items-end">
                        <Button variant="primary" onClick={create} loading={busy} icon={<Plus className="h-3.5 w-3.5" />}>
                            Adicionar
                        </Button>
                    </div>
                </div>
            ) : null}

            {lists.length === 0 ? (
                <EmptyState title="Nenhuma lista" message="Crie ao menos uma lista para organizar o público dos envios." />
            ) : (
                <ul className="flex flex-col gap-2">
                    {lists.map((list) => (
                        <li
                            key={list.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2"
                        >
                            <div>
                                <p className="text-sm text-[var(--theme-text-main)]">
                                    {list.name} {list.is_default ? <Badge tone="gold">padrão</Badge> : null}
                                </p>
                                <p className="text-[11px] text-[var(--theme-text-muted)]">
                                    {list.slug} · dupla confirmação {list.double_opt_in ? 'ativa' : 'desativada'}
                                </p>
                            </div>

                            {canWrite ? (
                                <div className="flex flex-wrap gap-1">
                                    {!list.is_default ? (
                                        <Button
                                            size="sm"
                                            onClick={async () => {
                                                await updateList(list.id, { is_default: true });
                                                // Clear the flag on the others first, otherwise the
                                                // partial unique index would reject the update.
                                                const previous = lists.filter((entry) => entry.is_default && entry.id !== list.id);
                                                for (const entry of previous) await updateList(entry.id, { is_default: false });
                                                toast.push('Lista padrão atualizada.', 'success');
                                                await onReload();
                                            }}
                                        >
                                            Tornar padrão
                                        </Button>
                                    ) : null}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async () => {
                                            await updateList(list.id, { double_opt_in: !list.double_opt_in });
                                            await onReload();
                                        }}
                                    >
                                        {list.double_opt_in ? 'Desativar confirmação' : 'Ativar confirmação'}
                                    </Button>
                                    <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteTarget(list)}>
                                        Remover
                                    </Button>
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Remover lista"
                message={`A lista "${deleteTarget?.name ?? ''}" deixará de ser oferecida, mas os inscritos permanecem na base.`}
                destructive
                confirmLabel="Remover"
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() =>
                    void (async () => {
                        if (deleteTarget) await deleteList(deleteTarget.id);
                        setDeleteTarget(null);
                        toast.push('Lista removida.', 'success');
                        await onReload();
                    })()
                }
            />
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

const SegmentsPanel: React.FC<{
    canWrite: boolean;
    segments: NewsletterSegment[];
    lists: NewsletterList[];
    onReload: () => Promise<void>;
}> = ({ canWrite, segments, lists, onReload }) => {
    const toast = React.useContext(ToastContext);

    const [editing, setEditing] = useState<NewsletterSegment | null>(null);
    const [creating, setCreating] = useState(false);
    const [preview, setPreview] = useState<{ segment: NewsletterSegment; rows: Awaited<ReturnType<typeof previewSegment>> } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<NewsletterSegment | null>(null);
    const [busy, setBusy] = useState(false);

    const recount = async (segment: NewsletterSegment) => {
        setBusy(true);
        try {
            const count = await countSegment(segment.id);
            toast.push(`"${segment.name}": ${count} inscrito(s).`, 'success');
            await onReload();
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao contar segmento', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card
            title="Segmentos"
            subtitle="Regras combináveis sobre a base. As regras são compiladas no banco a partir de uma lista fixa de campos e operadores."
            actions={
                canWrite ? (
                    <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>
                        Novo segmento
                    </Button>
                ) : null
            }
        >
            {segments.length === 0 ? (
                <EmptyState
                    title="Nenhum segmento"
                    message="Crie segmentos para direcionar conteúdo por perfil de interesse, engajamento ou origem."
                />
            ) : (
                <ul className="flex flex-col gap-2">
                    {segments.map((segment) => (
                        <li
                            key={segment.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2"
                        >
                            <div>
                                <p className="text-sm text-[var(--theme-text-main)]">{segment.name}</p>
                                <p className="text-[11px] text-[var(--theme-text-muted)]">
                                    {segment.rules?.conditions?.length ?? 0} condição(ões) ·{' '}
                                    {segment.cached_at
                                        ? `${formatInteger(segment.cached_count)} inscritos (${formatDateTime(segment.cached_at)})`
                                        : 'contagem não calculada'}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-1">
                                <Button size="sm" disabled={busy} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void recount(segment)}>
                                    Contar
                                </Button>
                                <Button
                                    size="sm"
                                    icon={<Users className="h-3.5 w-3.5" />}
                                    onClick={async () => {
                                        try {
                                            const rows = await previewSegment(segment.id, undefined, 25);
                                            setPreview({ segment, rows });
                                        } catch (error) {
                                            toast.push(error instanceof Error ? error.message : 'falha na prévia', 'error');
                                        }
                                    }}
                                >
                                    Prévia
                                </Button>
                                {canWrite ? (
                                    <>
                                        <Button size="sm" onClick={() => setEditing(segment)}>
                                            Editar
                                        </Button>
                                        <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteTarget(segment)} />
                                    </>
                                ) : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {creating || editing ? (
                <SegmentFormModal
                    segment={editing}
                    lists={lists}
                    onClose={() => {
                        setCreating(false);
                        setEditing(null);
                    }}
                    onSaved={async () => {
                        setCreating(false);
                        setEditing(null);
                        await onReload();
                    }}
                />
            ) : null}

            <Modal
                open={preview !== null}
                onClose={() => setPreview(null)}
                title={`Prévia do segmento: ${preview?.segment.name ?? ''}`}
                description="Primeiros inscritos que atendem às regras"
                width="lg"
            >
                {preview ? (
                    preview.rows.length === 0 ? (
                        <EmptyState title="Nenhum inscrito" message="Nenhum registro atende às regras deste segmento." />
                    ) : (
                        <table className="w-full text-sm">
                            <caption className="sr-only">Inscritos no segmento</caption>
                            <thead>
                                <tr className="text-left text-[11px] uppercase text-[var(--theme-text-muted)]">
                                    <th scope="col" className="py-1">E-mail</th>
                                    <th scope="col" className="py-1">Nome</th>
                                    <th scope="col" className="py-1">Situação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {preview.rows.map((row) => (
                                    <tr key={row.subscriber_id} className="border-t border-[var(--theme-border)]">
                                        <td className="py-1">{row.email}</td>
                                        <td className="py-1">{row.full_name ?? '—'}</td>
                                        <td className="py-1">{row.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                ) : null}
            </Modal>

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Remover segmento"
                message={`Campanhas que usam "${deleteTarget?.name ?? ''}" passam a considerar apenas a lista base.`}
                destructive
                confirmLabel="Remover"
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() =>
                    void (async () => {
                        if (deleteTarget) await deleteSegment(deleteTarget.id);
                        setDeleteTarget(null);
                        toast.push('Segmento removido.', 'success');
                        await onReload();
                    })()
                }
            />
        </Card>
    );
};

const SegmentFormModal: React.FC<{
    segment: NewsletterSegment | null;
    lists: NewsletterList[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}> = ({ segment, lists, onClose, onSaved }) => {
    const toast = React.useContext(ToastContext);

    const [name, setName] = useState(segment?.name ?? '');
    const [description, setDescription] = useState(segment?.description ?? '');
    const [match, setMatch] = useState<'all' | 'any'>(segment?.rules?.match ?? 'all');
    const [conditions, setConditions] = useState<SegmentCondition[]>(segment?.rules?.conditions ?? []);
    const [busy, setBusy] = useState(false);

    const updateCondition = (index: number, patch: Partial<SegmentCondition>) => {
        setConditions((current) => current.map((condition, position) => (position === index ? { ...condition, ...patch } : condition)));
    };

    const save = async () => {
        if (!name.trim()) {
            toast.push('Informe um nome para o segmento.', 'error');
            return;
        }

        setBusy(true);
        try {
            const rules = { match, conditions };

            if (segment) await updateSegment(segment.id, { name, description: description || null, rules });
            else await createSegment({ name, description: description || null, rules });

            toast.push('Segmento salvo.', 'success');
            await onSaved();
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao salvar segmento', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={segment ? 'Editar segmento' : 'Novo segmento'}
            description="Cada condição é combinada com E (todas) ou OU (qualquer)."
            width="lg"
            footer={
                <>
                    <Button onClick={onClose} disabled={busy}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={save} loading={busy}>
                        Salvar
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nome" required>
                        {(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
                    </Field>
                    <Field label="Descrição">
                        {(id) => <Input id={id} value={description} onChange={(event) => setDescription(event.target.value)} />}
                    </Field>
                </div>

                <Field label="Combinar condições">
                    {(id) => (
                        <Select id={id} value={match} onChange={(event) => setMatch(event.target.value as 'all' | 'any')}>
                            <option value="all">Atender a todas (E)</option>
                            <option value="any">Atender a qualquer uma (OU)</option>
                        </Select>
                    )}
                </Field>

                <div className="flex flex-col gap-2">
                    {conditions.length === 0 ? (
                        <p className="text-xs text-[var(--theme-text-muted)]">
                            Nenhuma condição: o segmento abrangerá toda a base ativa.
                        </p>
                    ) : (
                        conditions.map((condition, index) => {
                            const field = SEGMENT_FIELDS.find((entry) => entry.value === condition.field);

                            return (
                                <div key={index} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
                                    <Select
                                        aria-label="Campo"
                                        value={condition.field}
                                        onChange={(event) => updateCondition(index, { field: event.target.value, value: '' })}
                                    >
                                        {SEGMENT_FIELDS.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </Select>

                                    <Select
                                        aria-label="Operador"
                                        value={condition.operator}
                                        onChange={(event) => updateCondition(index, { operator: event.target.value })}
                                    >
                                        {SEGMENT_OPERATORS.map((entry) => (
                                            <option key={entry.value} value={entry.value}>
                                                {entry.label}
                                            </option>
                                        ))}
                                    </Select>

                                    {condition.operator === 'is_null' || condition.operator === 'is_not_null' ? (
                                        <span className="self-center text-xs text-[var(--theme-text-muted)]">(sem valor)</span>
                                    ) : field?.type === 'relation' && condition.field === 'in_list' ? (
                                        <Select
                                            aria-label="Lista"
                                            value={String(condition.value ?? '')}
                                            onChange={(event) => updateCondition(index, { value: event.target.value })}
                                        >
                                            <option value="">Selecionar lista…</option>
                                            {lists.map((list) => (
                                                <option key={list.id} value={list.id}>
                                                    {list.name}
                                                </option>
                                            ))}
                                        </Select>
                                    ) : (
                                        <Input
                                            aria-label="Valor"
                                            value={String(condition.value ?? '')}
                                            placeholder={
                                                condition.field === 'has_tag'
                                                    ? 'uuid da tag'
                                                    : field?.type === 'date'
                                                        ? 'AAAA-MM-DD'
                                                        : 'valor'
                                            }
                                            onChange={(event) => updateCondition(index, { value: event.target.value })}
                                        />
                                    )}

                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        icon={<Trash2 className="h-3.5 w-3.5" />}
                                        aria-label="Remover condição"
                                        onClick={() => setConditions((current) => current.filter((_, position) => position !== index))}
                                    />
                                </div>
                            );
                        })
                    )}

                    <Button
                        size="sm"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => setConditions((current) => [...current, { field: 'status', operator: 'eq', value: 'active' }])}
                    >
                        Adicionar condição
                    </Button>
                </div>

                <Alert tone="info">
                    Campos e operadores são validados no banco: valores fora da lista permitida são recusados, o que impede a
                    construção de SQL por injeção.
                </Alert>
            </div>
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TemplatesPanel: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
    const toast = React.useContext(ToastContext);

    const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [category, setCategory] = useState('geral');
    const [subject, setSubject] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setTemplates(await listTemplates());
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao carregar modelos', 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <Card
            title="Modelos"
            subtitle="Estruturas reutilizáveis de conteúdo. Aplicar um modelo copia os blocos e o estilo para a campanha, sem vínculo permanente."
        >
            {canWrite ? (
                <div className="mb-4 grid gap-3 sm:grid-cols-[1.2fr_1fr_1.4fr_auto]">
                    <Field label="Nome">
                        {(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value)} />}
                    </Field>
                    <Field label="Categoria">
                        {(id) => <Input id={id} value={category} onChange={(event) => setCategory(event.target.value)} />}
                    </Field>
                    <Field label="Assunto sugerido">
                        {(id) => <Input id={id} value={subject} onChange={(event) => setSubject(event.target.value)} />}
                    </Field>
                    <div className="flex items-end">
                        <Button
                            variant="primary"
                            loading={busy}
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={async () => {
                                if (!name.trim()) {
                                    toast.push('Informe um nome para o modelo.', 'error');
                                    return;
                                }
                                setBusy(true);
                                try {
                                    await createTemplate({ name, category, subject, blocks: [] });
                                    setName('');
                                    setSubject('');
                                    toast.push('Modelo criado. Adicione blocos em uma campanha e salve como modelo.', 'success');
                                    await load();
                                } catch (error) {
                                    toast.push(error instanceof Error ? error.message : 'falha ao criar modelo', 'error');
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            Criar
                        </Button>
                    </div>
                </div>
            ) : null}

            {loading ? (
                <Spinner label="Carregando modelos" />
            ) : templates.length === 0 ? (
                <EmptyState title="Nenhum modelo" message="Modelos aceleram a montagem de campanhas recorrentes." />
            ) : (
                <ul className="flex flex-col gap-2">
                    {templates.map((template) => (
                        <li
                            key={template.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2"
                        >
                            <div>
                                <p className="text-sm text-[var(--theme-text-main)]">{template.name}</p>
                                <p className="text-[11px] text-[var(--theme-text-muted)]">
                                    {template.category} · {template.blocks.length} bloco(s) · atualizado em{' '}
                                    {formatDateTime(template.updated_at)}
                                </p>
                            </div>

                            {canWrite ? (
                                <div className="flex gap-1">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async () => {
                                            await updateTemplate(template.id, { is_archived: !template.is_archived });
                                            await load();
                                        }}
                                    >
                                        {template.is_archived ? 'Restaurar' : 'Arquivar'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="danger"
                                        icon={<Trash2 className="h-3.5 w-3.5" />}
                                        onClick={async () => {
                                            await deleteTemplate(template.id);
                                            toast.push('Modelo removido.', 'success');
                                            await load();
                                        }}
                                    />
                                </div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

const ProvidersPanel: React.FC<{ canAdmin: boolean }> = ({ canAdmin }) => {
    const toast = React.useContext(ToastContext);

    const [providers, setProviders] = useState<NewsletterProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        name: '',
        kind: 'resend' as ProviderKind,
        secret_ref: 'RESEND_API_KEY',
        webhook_secret_ref: 'RESEND_WEBHOOK_SECRET',
        from_name: '',
        from_email: '',
        per_second_limit: 10,
        daily_limit: '',
        host: '',
        port: '587',
        username: '',
        domain: '',
    });
    const [deleteTarget, setDeleteTarget] = useState<NewsletterProvider | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setProviders(await listProviders());
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao carregar provedores', 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <Card
            title="Provedores de envio"
            subtitle="Nenhuma credencial é armazenada no banco: informe apenas o nome do segredo configurado nas variáveis do Edge Function."
        >
            <Alert tone="info">
                Configure os segredos no projeto Supabase com{' '}
                <code className="rounded bg-black/30 px-1">supabase secrets set RESEND_API_KEY=...</code>. O campo
                &ldquo;segredo&rdquo; abaixo guarda somente o <strong>nome</strong> da variável.
            </Alert>

            {canAdmin ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Field label="Nome do provedor">
                        {(id) => <Input id={id} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />}
                    </Field>

                    <Field label="Tipo">
                        {(id) => (
                            <Select
                                id={id}
                                value={form.kind}
                                onChange={(event) => setForm({ ...form, kind: event.target.value as ProviderKind })}
                            >
                                {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Segredo (nome da variável)" required>
                        {(id) => (
                            <Input id={id} value={form.secret_ref} onChange={(event) => setForm({ ...form, secret_ref: event.target.value })} />
                        )}
                    </Field>

                    <Field label="Segredo do webhook">
                        {(id) => (
                            <Input
                                id={id}
                                value={form.webhook_secret_ref}
                                onChange={(event) => setForm({ ...form, webhook_secret_ref: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label="Nome remetente padrão">
                        {(id) => <Input id={id} value={form.from_name} onChange={(event) => setForm({ ...form, from_name: event.target.value })} />}
                    </Field>

                    <Field label="E-mail remetente padrão">
                        {(id) => (
                            <Input
                                id={id}
                                type="email"
                                value={form.from_email}
                                onChange={(event) => setForm({ ...form, from_email: event.target.value })}
                            />
                        )}
                    </Field>

                    <Field label="Limite por segundo" hint="Protege a reputação do domínio.">
                        {(id) => (
                            <Input
                                id={id}
                                type="number"
                                min={1}
                                max={100}
                                value={form.per_second_limit}
                                onChange={(event) => setForm({ ...form, per_second_limit: Number(event.target.value) })}
                            />
                        )}
                    </Field>

                    <Field label="Limite diário" hint="Deixe vazio para ilimitado.">
                        {(id) => (
                            <Input
                                id={id}
                                type="number"
                                min={1}
                                value={form.daily_limit}
                                onChange={(event) => setForm({ ...form, daily_limit: event.target.value })}
                            />
                        )}
                    </Field>

                    {form.kind === 'smtp' ? (
                        <>
                            <Field label="Host SMTP">
                                {(id) => <Input id={id} value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} />}
                            </Field>
                            <Field label="Porta">
                                {(id) => <Input id={id} value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} />}
                            </Field>
                            <Field label="Usuário SMTP">
                                {(id) => (
                                    <Input id={id} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
                                )}
                            </Field>
                        </>
                    ) : null}

                    {form.kind === 'mailgun' ? (
                        <Field label="Domínio Mailgun">
                            {(id) => <Input id={id} value={form.domain} onChange={(event) => setForm({ ...form, domain: event.target.value })} />}
                        </Field>
                    ) : null}

                    <div className="flex items-end">
                        <Button
                            variant="primary"
                            loading={busy}
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={async () => {
                                if (!form.name.trim()) {
                                    toast.push('Informe um nome para o provedor.', 'error');
                                    return;
                                }

                                setBusy(true);
                                try {
                                    await createProvider({
                                        name: form.name,
                                        kind: form.kind,
                                        is_active: true,
                                        from_name: form.from_name || null,
                                        from_email: form.from_email || null,
                                        secret_ref: form.secret_ref || null,
                                        webhook_secret_ref: form.webhook_secret_ref || null,
                                        per_second_limit: form.per_second_limit,
                                        daily_limit: form.daily_limit ? Number(form.daily_limit) : null,
                                        config:
                                            form.kind === 'smtp'
                                                ? { host: form.host, port: Number(form.port), username: form.username }
                                                : form.kind === 'mailgun'
                                                    ? { domain: form.domain }
                                                    : {},
                                    });
                                    toast.push('Provedor criado. Ative-o ou defina como padrão para ser usado.', 'success');
                                    await load();
                                } catch (error) {
                                    toast.push(error instanceof Error ? error.message : 'falha ao criar provedor', 'error');
                                } finally {
                                    setBusy(false);
                                }
                            }}
                        >
                            Adicionar
                        </Button>
                    </div>
                </div>
            ) : null}

            <div className="mt-4">
                {loading ? (
                    <Spinner label="Carregando provedores" />
                ) : providers.length === 0 ? (
                    <EmptyState
                        title="Nenhum provedor configurado"
                        message="Sem um provedor ativo o disparo é bloqueado com uma mensagem explícita, em vez de falhar silenciosamente."
                    />
                ) : (
                    <ul className="flex flex-col gap-2">
                        {providers.map((provider) => (
                            <li
                                key={provider.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2"
                            >
                                <div>
                                    <p className="text-sm text-[var(--theme-text-main)]">
                                        {provider.name} <Badge tone="neutral">{PROVIDER_LABELS[provider.kind]}</Badge>{' '}
                                        {provider.is_default ? <Badge tone="gold">padrão</Badge> : null}{' '}
                                        {!provider.is_active ? <Badge tone="warning">inativo</Badge> : null}
                                    </p>
                                    <p className="text-[11px] text-[var(--theme-text-muted)]">
                                        segredo: {provider.secret_ref ?? '—'} · webhook: {provider.webhook_secret_ref ?? '—'} · limite{' '}
                                        {provider.per_second_limit}/s
                                        {provider.daily_limit ? ` · ${formatInteger(provider.daily_limit)}/dia` : ''}
                                    </p>
                                </div>

                                {canAdmin ? (
                                    <div className="flex flex-wrap gap-1">
                                        <Button
                                            size="sm"
                                            onClick={async () => {
                                                await setDefaultProvider(provider.id);
                                                toast.push('Provedor padrão atualizado.', 'success');
                                                await load();
                                            }}
                                        >
                                            Tornar padrão
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={async () => {
                                                await updateProvider(provider.id, { is_active: !provider.is_active });
                                                await load();
                                            }}
                                        >
                                            {provider.is_active ? 'Desativar' : 'Ativar'}
                                        </Button>
                                        <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteTarget(provider)} />
                                    </div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Remover provedor"
                message={`"${deleteTarget?.name ?? ''}" deixará de ser usado. Campanhas em disparo serão bloqueadas se não houver outro provedor ativo.`}
                destructive
                confirmLabel="Remover"
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() =>
                    void (async () => {
                        if (deleteTarget) await deleteProvider(deleteTarget.id);
                        setDeleteTarget(null);
                        toast.push('Provedor removido.', 'success');
                        await load();
                    })()
                }
            />
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Global settings
// ---------------------------------------------------------------------------

const GlobalSettingsPanel: React.FC<{ canAdmin: boolean; lists: NewsletterList[] }> = ({ canAdmin, lists }) => {
    const toast = React.useContext(ToastContext);

    const [settings, setSettings] = useState<NewsletterSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        void getSettings()
            .then(setSettings)
            .catch((error) =>
                toast.push(error instanceof Error ? error.message : 'falha ao carregar configurações', 'error'),
            )
            .finally(() => setLoading(false));
    }, [toast]);

    if (loading || !settings) return <Spinner label="Carregando configurações" />;

    const patch = (changes: Partial<NewsletterSettings>) =>
        setSettings((current) => (current ? { ...current, ...changes } : current));

    return (
        <Card
            title="Parâmetros de envio"
            subtitle="Controlam janela de envio, limites, tentativas e a identificação legal das mensagens."
            actions={
                canAdmin ? (
                    <Button
                        variant="primary"
                        size="sm"
                        loading={busy}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                await updateSettings(settings);
                                toast.push('Configurações salvas.', 'success');
                            } catch (error) {
                                toast.push(error instanceof Error ? error.message : 'falha ao salvar', 'error');
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        Salvar
                    </Button>
                ) : null
            }
        >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Nome remetente">
                    {(id) => (
                        <Input id={id} value={settings.default_from_name} disabled={!canAdmin} onChange={(event) => patch({ default_from_name: event.target.value })} />
                    )}
                </Field>
                <Field label="E-mail remetente">
                    {(id) => (
                        <Input id={id} type="email" value={settings.default_from_email} disabled={!canAdmin} onChange={(event) => patch({ default_from_email: event.target.value })} />
                    )}
                </Field>
                <Field label="Responder para">
                    {(id) => (
                        <Input id={id} value={settings.default_reply_to ?? ''} disabled={!canAdmin} onChange={(event) => patch({ default_reply_to: event.target.value })} />
                    )}
                </Field>

                <Field label="Lista padrão">
                    {(id) => (
                        <Select id={id} value={settings.default_list_id ?? ''} disabled={!canAdmin} onChange={(event) => patch({ default_list_id: event.target.value || null })}>
                            <option value="">Nenhuma</option>
                            {lists.map((list) => (
                                <option key={list.id} value={list.id}>
                                    {list.name}
                                </option>
                            ))}
                        </Select>
                    )}
                </Field>

                <Field label="Limite por segundo">
                    {(id) => (
                        <Input id={id} type="number" min={1} value={settings.throttle_per_second} disabled={!canAdmin} onChange={(event) => patch({ throttle_per_second: Number(event.target.value) })} />
                    )}
                </Field>
                <Field label="Limite diário" hint="Vazio para ilimitado.">
                    {(id) => (
                        <Input id={id} type="number" min={1} value={settings.daily_send_limit ?? ''} disabled={!canAdmin} onChange={(event) => patch({ daily_send_limit: event.target.value ? Number(event.target.value) : null })} />
                    )}
                </Field>

                <Field label="Máximo de tentativas">
                    {(id) => (
                        <Input id={id} type="number" min={1} max={10} value={settings.retry_max_attempts} disabled={!canAdmin} onChange={(event) => patch({ retry_max_attempts: Number(event.target.value) })} />
                    )}
                </Field>
                <Field label="Backoff base (segundos)">
                    {(id) => (
                        <Input id={id} type="number" min={0} value={settings.retry_backoff_seconds} disabled={!canAdmin} onChange={(event) => patch({ retry_backoff_seconds: Number(event.target.value) })} />
                    )}
                </Field>

                <Field label="Silêncio — início">
                    {(id) => (
                        <Input id={id} type="time" value={settings.quiet_hours_start ?? ''} disabled={!canAdmin} onChange={(event) => patch({ quiet_hours_start: event.target.value || null })} />
                    )}
                </Field>
                <Field label="Silêncio — fim">
                    {(id) => (
                        <Input id={id} type="time" value={settings.quiet_hours_end ?? ''} disabled={!canAdmin} onChange={(event) => patch({ quiet_hours_end: event.target.value || null })} />
                    )}
                </Field>

                <Field label="Contato de privacidade">
                    {(id) => (
                        <Input id={id} type="email" value={settings.gdpr_contact_email ?? ''} disabled={!canAdmin} onChange={(event) => patch({ gdpr_contact_email: event.target.value })} />
                    )}
                </Field>
                <Field label="URL da política de privacidade">
                    {(id) => (
                        <Input id={id} value={settings.privacy_policy_url ?? ''} disabled={!canAdmin} onChange={(event) => patch({ privacy_policy_url: event.target.value })} />
                    )}
                </Field>
                <Field label="Endereço físico" hint="Exigido por boas práticas de anti-spam.">
                    {(id) => (
                        <Input id={id} value={settings.physical_address ?? ''} disabled={!canAdmin} onChange={(event) => patch({ physical_address: event.target.value })} />
                    )}
                </Field>

                <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="Rodapé de descadastro">
                        {(id) => (
                            <Textarea id={id} value={settings.unsubscribe_footer ?? ''} disabled={!canAdmin} onChange={(event) => patch({ unsubscribe_footer: event.target.value })} />
                        )}
                    </Field>
                </div>

                <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-3">
                    <Toggle
                        checked={settings.tracking_opens}
                        onChange={(value) => patch({ tracking_opens: value })}
                        disabled={!canAdmin}
                        label="Rastrear aberturas"
                        hint="Insere um pixel invisível. Alguns clientes bloqueiam imagens, então a taxa tende a ser subestimada."
                    />
                    <Toggle
                        checked={settings.tracking_clicks}
                        onChange={(value) => patch({ tracking_clicks: value })}
                        disabled={!canAdmin}
                        label="Rastrear cliques"
                        hint="Reescreve os links para passar por um redirecionador assinado."
                    />
                </div>
            </div>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

const AuditPanel: React.FC<{ canAdmin: boolean }> = ({ canAdmin }) => {
    const toast = React.useContext(ToastContext);

    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState('');
    const [entityType, setEntityType] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setLogs(await listAuditLogs({ action: action || null, entityType: entityType || null, limit: 200 }));
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao carregar auditoria', 'error');
        } finally {
            setLoading(false);
        }
    }, [action, entityType, toast]);

    useEffect(() => {
        void load();
    }, [load]);

    if (!canAdmin) {
        return (
            <Card title="Trilha de auditoria">
                <Alert tone="info">Disponível para perfis administrador e master admin.</Alert>
            </Card>
        );
    }

    return (
        <Card
            title="Trilha de auditoria"
            subtitle="Registro imutável de quem alterou o quê, com estado anterior e posterior."
            actions={
                <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
                    Atualizar
                </Button>
            }
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ação">
                    {(id) => <Input id={id} value={action} placeholder="ex.: create, update, send_test" onChange={(event) => setAction(event.target.value)} />}
                </Field>
                <Field label="Entidade">
                    {(id) => (
                        <Input id={id} value={entityType} placeholder="ex.: newsletter_campaigns" onChange={(event) => setEntityType(event.target.value)} />
                    )}
                </Field>
            </div>

            <div className="mt-4">
                {loading ? (
                    <Spinner label="Carregando auditoria" />
                ) : logs.length === 0 ? (
                    <EmptyState title="Nenhum registro" message="Ações administrativas aparecerão aqui conforme forem executadas." />
                ) : (
                    <div className="max-h-[420px] overflow-y-auto">
                        <table className="w-full text-xs">
                            <caption className="sr-only">Trilha de auditoria</caption>
                            <thead className="sticky top-0 bg-[var(--theme-card)]">
                                <tr className="text-left text-[var(--theme-text-muted)]">
                                    <th scope="col" className="py-1">Data</th>
                                    <th scope="col" className="py-1">Ator</th>
                                    <th scope="col" className="py-1">Ação</th>
                                    <th scope="col" className="py-1">Entidade</th>
                                    <th scope="col" className="py-1">Resumo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id} className="border-t border-[var(--theme-border)]">
                                        <td className="py-1 whitespace-nowrap">{formatDateTime(log.created_at)}</td>
                                        <td className="py-1">{log.actor_email ?? '—'}</td>
                                        <td className="py-1">
                                            <Badge tone="neutral">{log.action}</Badge>
                                        </td>
                                        <td className="py-1">{log.entity_type}</td>
                                        <td className="py-1 text-[var(--theme-text-muted)]">{log.summary ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Admin users
// ---------------------------------------------------------------------------

const AdminUsersPanel: React.FC<{ canAdmin: boolean; role: AdminRole | null }> = ({ canAdmin, role }) => {
    const toast = React.useContext(ToastContext);

    const [users, setUsers] = useState<AdminProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [newRole, setNewRole] = useState<AdminRole>('editor');
    const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AdminProfile | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { users: rows } = await listAdminUsers();
            setUsers(rows);
        } catch (error) {
            toast.push(error instanceof Error ? error.message : 'falha ao listar usuários', 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (role === 'master_admin') void load();
        else setLoading(false);
    }, [load, role]);

    if (role !== 'master_admin') {
        return (
            <Card title="Usuários administrativos">
                <Alert tone="info">
                    Apenas o perfil master admin pode criar e alterar usuários. Perfis e acessos são definidos no servidor, nunca
                    pelo próprio usuário.
                </Alert>
            </Card>
        );
    }

    return (
        <Card title="Usuários administrativos" subtitle="Perfis controlam o que cada pessoa pode fazer no módulo.">
            <div className="grid gap-3 sm:grid-cols-4">
                <Field label="E-mail" required>
                    {(id) => <Input id={id} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />}
                </Field>
                <Field label="Nome completo">
                    {(id) => <Input id={id} value={fullName} onChange={(event) => setFullName(event.target.value)} />}
                </Field>
                <Field label="Perfil">
                    {(id) => (
                        <Select id={id} value={newRole} onChange={(event) => setNewRole(event.target.value as AdminRole)}>
                            {Object.entries(ADMIN_ROLE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </Select>
                    )}
                </Field>
                <div className="flex items-end">
                    <Button
                        variant="primary"
                        loading={busy}
                        icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={async () => {
                            setBusy(true);
                            try {
                                const result = await createAdminUser({ email, full_name: fullName, role: newRole });
                                setRecoveryLink(result.recovery_link);
                                setEmail('');
                                setFullName('');
                                toast.push('Usuário criado. Entregue o link de acesso com segurança.', 'success');
                                await load();
                            } catch (error) {
                                toast.push(error instanceof Error ? error.message : 'falha ao criar usuário', 'error');
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        Criar
                    </Button>
                </div>
            </div>

            {recoveryLink ? (
                <div className="mt-3">
                    <Alert tone="info">
                        <p className="font-medium">Link de definição de senha (válido por tempo limitado)</p>
                        <p className="mt-1 break-all text-[11px]">{recoveryLink}</p>
                        <Button
                            size="sm"
                            className="mt-2"
                            icon={<Copy className="h-3.5 w-3.5" />}
                            onClick={() => {
                                void navigator.clipboard.writeText(recoveryLink);
                                toast.push('Link copiado.', 'success');
                            }}
                        >
                            Copiar link
                        </Button>
                    </Alert>
                </div>
            ) : null}

            <div className="mt-4">
                {loading ? (
                    <Spinner label="Carregando usuários" />
                ) : users.length === 0 ? (
                    <EmptyState title="Nenhum usuário" message="Crie o primeiro usuário administrativo acima." />
                ) : (
                    <table className="w-full text-sm">
                        <caption className="sr-only">Usuários administrativos</caption>
                        <thead>
                            <tr className="text-left text-[11px] uppercase text-[var(--theme-text-muted)]">
                                <th scope="col" className="py-1">Usuário</th>
                                <th scope="col" className="py-1">Perfil</th>
                                <th scope="col" className="py-1">Acesso</th>
                                <th scope="col" className="py-1 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.user_id} className="border-t border-[var(--theme-border)]">
                                    <td className="py-1">
                                        <p className="text-[var(--theme-text-main)]">{user.full_name ?? '—'}</p>
                                        <p className="text-[11px] text-[var(--theme-text-muted)]">{user.email}</p>
                                    </td>
                                    <td className="py-1">
                                        <Select
                                            aria-label={`Perfil de ${user.email}`}
                                            value={user.role}
                                            disabled={busy || user.user_id === undefined}
                                            onChange={async (event) => {
                                                try {
                                                    await setAdminUserRole(user.user_id, event.target.value as AdminRole);
                                                    toast.push('Perfil atualizado.', 'success');
                                                    await load();
                                                } catch (error) {
                                                    toast.push(error instanceof Error ? error.message : 'falha ao alterar perfil', 'error');
                                                }
                                            }}
                                        >
                                            {Object.entries(ADMIN_ROLE_LABELS).map(([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            ))}
                                        </Select>
                                    </td>
                                    <td className="py-1">
                                        {user.is_active ? <Badge tone="success">ativo</Badge> : <Badge tone="warning">sem acesso</Badge>}
                                    </td>
                                    <td className="py-1">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={async () => {
                                                    try {
                                                        await setAdminUserActive(user.user_id, !user.is_active);
                                                        toast.push(user.is_active ? 'Acesso revogado.' : 'Acesso liberado.', 'success');
                                                        await load();
                                                    } catch (error) {
                                                        toast.push(error instanceof Error ? error.message : 'falha ao alterar acesso', 'error');
                                                    }
                                                }}
                                            >
                                                {user.is_active ? 'Revogar' : 'Liberar'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={async () => {
                                                    try {
                                                        const result = await generateRecoveryLink(user.user_id);
                                                        setRecoveryLink(result.recovery_link);
                                                        toast.push('Link de recuperação gerado.', 'success');
                                                    } catch (error) {
                                                        toast.push(error instanceof Error ? error.message : 'falha ao gerar link', 'error');
                                                    }
                                                }}
                                            >
                                                Recuperar senha
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                icon={<Trash2 className="h-3.5 w-3.5" />}
                                                aria-label={`Excluir ${user.email}`}
                                                onClick={() => setDeleteTarget(user)}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Excluir usuário"
                message={`A conta ${deleteTarget?.email ?? ''} será removida e todas as sessões ativas serão encerradas. A trilha de auditoria é preservada.`}
                destructive
                confirmLabel="Excluir"
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() =>
                    void (async () => {
                        try {
                            if (deleteTarget) await deleteAdminUser(deleteTarget.user_id);
                            toast.push('Usuário excluído.', 'success');
                            await load();
                        } catch (error) {
                            toast.push(error instanceof Error ? error.message : 'falha ao excluir', 'error');
                        } finally {
                            setDeleteTarget(null);
                        }
                    })()
                }
            />
        </Card>
    );
};

export default SettingsPanels;
