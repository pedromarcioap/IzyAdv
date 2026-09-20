/**
 * Campaign management: CRUD, duplication, scheduling, lifecycle control,
 * A/B configuration, metrics comparison, test sends and link validation.
 *
 * Lifecycle transitions are never applied optimistically. The database owns the
 * transition table and rejects invalid moves, so the UI re-reads the campaign
 * after every action instead of guessing the resulting state.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarClock,
    Copy,
    Link2,
    Pause,
    Play,
    Plus,
    Send,
    Trash2,
    XCircle,
} from 'lucide-react';
import type {
    CampaignStatus,
    NewsletterBlock,
    NewsletterCampaign,
    NewsletterDesign,
    NewsletterList,
    NewsletterSegment,
    NewsletterTemplate,
} from '../../../types/newsletter';
import { CAMPAIGN_STATUS_LABELS } from '../../../types/newsletter';
import {
    archiveCampaign,
    cancelCampaign,
    checkCampaignLinks,
    createCampaign,
    duplicateCampaign,
    ensureAudience,
    getCampaign,
    listCampaignVersions,
    listCampaigns,
    listTemplates,
    pauseCampaign,
    pokeDispatcher,
    resumeCampaign,
    scheduleCampaign,
    sendCampaignNow,
    sendTestEmail,
    unscheduleCampaign,
    updateCampaign,
    type LinkCheckResult,
} from '../../../lib/newsletter/campaigns';
import { campaignMetrics, campaignVariantMetrics, type VariantMetrics } from '../../../lib/newsletter/analytics';
import { formatCurrencyFromCents, formatDate, formatDateTime, formatInteger, formatPercent } from '../../../lib/newsletter/client';
import { extractBlockLinks, renderPreviewDocument } from '../../../lib/newsletter/validation';
import { DEFAULT_DESIGN } from '../../../types/newsletter';
import { NewsletterEditor } from './NewsletterEditor';
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
    ToastContext,
    Toggle,
} from './ui';

function statusTone(status: CampaignStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    switch (status) {
        case 'sent':
            return 'success';
        case 'sending':
        case 'queued':
            return 'info';
        case 'scheduled':
            return 'warning';
        case 'failed':
        case 'canceled':
            return 'danger';
        case 'paused':
            return 'warning';
        default:
            return 'neutral';
    }
}

export const CampaignsManager: React.FC<{
    canWrite: boolean;
    lists: NewsletterList[];
    segments: NewsletterSegment[];
}> = ({ canWrite, lists, segments }) => {
    const toast = React.useContext(ToastContext);

    const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
    const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
    const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [editing, setEditing] = useState<NewsletterCampaign | null>(null);
    const [creating, setCreating] = useState(false);
    const [metricsFor, setMetricsFor] = useState<NewsletterCampaign | null>(null);
    const [scheduleFor, setScheduleFor] = useState<NewsletterCampaign | null>(null);
    const [testFor, setTestFor] = useState<NewsletterCampaign | null>(null);
    const [linksFor, setLinksFor] = useState<{ campaign: NewsletterCampaign; results: LinkCheckResult[] } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<NewsletterCampaign | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [rows, tpl] = await Promise.all([
                listCampaigns({ status: statusFilter || null, search }),
                listTemplates(),
            ]);
            setCampaigns(rows);
            setTemplates(tpl);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'falha ao carregar campanhas');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, search]);

    useEffect(() => {
        void load();
    }, [load]);

    const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
        setBusy(true);
        try {
            await action();
            toast.push(successMessage, 'success');
            await load();
        } catch (actionError) {
            toast.push(actionError instanceof Error ? actionError.message : 'ação falhou', 'error');
        } finally {
            setBusy(false);
        }
    };

    const grouped = useMemo(() => {
        const counts: Record<string, number> = {};
        campaigns.forEach((campaign) => {
            counts[campaign.status] = (counts[campaign.status] ?? 0) + 1;
        });
        return counts;
    }, [campaigns]);

    const checkLinks = async (campaign: NewsletterCampaign) => {
        setBusy(true);
        try {
            const results = await checkCampaignLinks(campaign.id);
            setLinksFor({ campaign, results });
            const broken = results.filter((result) => !result.ok).length;
            toast.push(
                broken === 0
                    ? `${results.length} link(s) verificados, nenhum problema encontrado.`
                    : `${results.length} link(s) verificados, ${broken} com problema.`,
                broken === 0 ? 'success' : 'error',
            );
        } catch (linkError) {
            toast.push(linkError instanceof Error ? linkError.message : 'falha na verificação de links', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-col gap-5">
            {error ? <Alert tone="error">{error}</Alert> : null}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Enviadas" value={formatInteger(grouped.sent ?? 0)} />
                <Stat label="Agendadas" value={formatInteger(grouped.scheduled ?? 0)} />
                <Stat label="Rascunhos" value={formatInteger(grouped.draft ?? 0)} />
                <Stat
                    label="Em andamento"
                    value={formatInteger((grouped.sending ?? 0) + (grouped.queued ?? 0))}
                    hint={`${formatInteger(grouped.paused ?? 0)} pausada(s)`}
                />
            </div>

            <Card
                title="Campanhas"
                subtitle="Crie, agende, dispare e acompanhe o desempenho de cada informativo."
                actions={
                    canWrite ? (
                        <Button
                            variant="primary"
                            size="sm"
                            icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                            onClick={() => setCreating(true)}
                        >
                            Nova campanha
                        </Button>
                    ) : null
                }
            >
                <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Buscar">
                        {(id) => (
                            <Input
                                id={id}
                                type="search"
                                value={search}
                                placeholder="nome ou assunto"
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        )}
                    </Field>

                    <Field label="Situação">
                        {(id) => (
                            <Select
                                id={id}
                                value={statusFilter}
                                onChange={(event) => setStatusFilter(event.target.value as CampaignStatus | '')}
                            >
                                <option value="">Todas</option>
                                {Object.entries(CAMPAIGN_STATUS_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>
                </div>

                <div className="mt-4">
                    {loading ? (
                        <Spinner label="Carregando campanhas" />
                    ) : campaigns.length === 0 ? (
                        <EmptyState
                            title="Nenhuma campanha"
                            message="Crie a primeira campanha para começar a enviar o informativo."
                            action={
                                canWrite ? (
                                    <Button variant="primary" onClick={() => setCreating(true)}>
                                        Nova campanha
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <ul className="flex flex-col gap-3">
                            {campaigns.map((campaign) => (
                                <li
                                    key={campaign.id}
                                    className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="font-serif text-base text-[var(--theme-text-main)]">{campaign.name}</h4>
                                                <Badge tone={statusTone(campaign.status)}>
                                                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                                                </Badge>
                                                {campaign.ab_test_enabled ? <Badge tone="gold">Teste A/B</Badge> : null}
                                                <Badge tone="neutral">v{campaign.version}</Badge>
                                            </div>
                                            <p className="mt-1 text-xs text-[var(--theme-text-muted)]">
                                                Assunto: {campaign.subject || <em>defina o assunto</em>}
                                            </p>
                                            <p className="text-[11px] text-[var(--theme-text-muted)]">
                                                {campaign.scheduled_at
                                                    ? `Agendada para ${formatDateTime(campaign.scheduled_at)}`
                                                    : campaign.completed_at
                                                        ? `Concluída em ${formatDateTime(campaign.completed_at)}`
                                                        : `Criada em ${formatDate(campaign.created_at)}`}
                                            </p>
                                            {campaign.last_error ? (
                                                <p className="mt-1 text-[11px] text-red-300">Último erro: {campaign.last_error}</p>
                                            ) : null}
                                        </div>

                                        <div className="flex flex-wrap gap-1">
                                            <Button size="sm" onClick={() => setMetricsFor(campaign)}>
                                                Métricas
                                            </Button>
                                            {canWrite ? (
                                                <>
                                                    <Button size="sm" onClick={() => setEditing(campaign)}>
                                                        Editar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        icon={<Link2 className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        disabled={busy}
                                                        onClick={() => void checkLinks(campaign)}
                                                    >
                                                        Links
                                                    </Button>
                                                    <Button size="sm" disabled={busy} onClick={() => setTestFor(campaign)}>
                                                        Teste
                                                    </Button>

                                                    {['draft', 'scheduled'].includes(campaign.status) ? (
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
                                                            loading={busy}
                                                            onClick={() =>
                                                                runAction(async () => {
                                                                    const result = await sendCampaignNow(campaign.id);
                                                                    await pokeDispatcher(campaign.id);
                                                                    return result;
                                                                }, 'Campanha enviada para a fila de disparo.')
                                                            }
                                                        >
                                                            Disparar agora
                                                        </Button>
                                                    ) : null}

                                                    {campaign.status === 'sending' || campaign.status === 'queued' ? (
                                                        <Button
                                                            size="sm"
                                                            icon={<Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                                                            disabled={busy}
                                                            onClick={() =>
                                                                runAction(() => pauseCampaign(campaign.id), 'Disparo pausado.')
                                                            }
                                                        >
                                                            Pausar
                                                        </Button>
                                                    ) : null}

                                                    {campaign.status === 'paused' ? (
                                                        <Button
                                                            size="sm"
                                                            variant="primary"
                                                            icon={<Play className="h-3.5 w-3.5" aria-hidden="true" />}
                                                            disabled={busy}
                                                            onClick={() =>
                                                                runAction(async () => {
                                                                    await resumeCampaign(campaign.id);
                                                                    await pokeDispatcher(campaign.id);
                                                                }, 'Disparo retomado.')
                                                            }
                                                        >
                                                            Retomar
                                                        </Button>
                                                    ) : null}

                                                    {['draft', 'scheduled'].includes(campaign.status) ? (
                                                        <Button
                                                            size="sm"
                                                            icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />}
                                                            onClick={() => setScheduleFor(campaign)}
                                                        >
                                                            {campaign.scheduled_at ? 'Reagendar' : 'Agendar'}
                                                        </Button>
                                                    ) : null}

                                                    {campaign.status === 'scheduled' ? (
                                                        <Button
                                                            size="sm"
                                                            disabled={busy}
                                                            onClick={() =>
                                                                runAction(() => unscheduleCampaign(campaign.id), 'Agendamento removido.')
                                                            }
                                                        >
                                                            Desagendar
                                                        </Button>
                                                    ) : null}

                                                    <Button
                                                        size="sm"
                                                        icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        disabled={busy}
                                                        onClick={() =>
                                                            runAction(() => duplicateCampaign(campaign.id), 'Campanha duplicada como rascunho.')
                                                        }
                                                        aria-label={`Duplicar ${campaign.name}`}
                                                    >
                                                        Duplicar
                                                    </Button>

                                                    {['draft', 'scheduled', 'paused', 'queued', 'sending'].includes(campaign.status) ? (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            icon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                                                            disabled={busy}
                                                            onClick={() =>
                                                                runAction(() => cancelCampaign(campaign.id, 'cancelada no painel'), 'Campanha cancelada.')
                                                            }
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    ) : null}

                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        aria-label={`Arquivar ${campaign.name}`}
                                                        onClick={() => setDeleteTarget(campaign)}
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                    </div>

                                    {campaign.total_recipients > 0 ? (
                                        <p className="mt-2 text-[11px] text-[var(--theme-text-muted)]">
                                            {formatInteger(campaign.sent_count)}/{formatInteger(campaign.total_recipients)} enviados ·{' '}
                                            {formatInteger(campaign.delivered_count)} entregues ·{' '}
                                            {formatInteger(campaign.unique_open_count)} aberturas ·{' '}
                                            {formatInteger(campaign.unique_click_count)} cliques ·{' '}
                                            {formatInteger(campaign.bounce_count)} bounces
                                        </p>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </Card>

            {/* Editor --------------------------------------------------------- */}
            {editing || creating ? (
                <CampaignEditorModal
                    campaign={editing}
                    templates={templates}
                    lists={lists}
                    segments={segments}
                    canWrite={canWrite}
                    onClose={() => {
                        setEditing(null);
                        setCreating(false);
                    }}
                    onSaved={async () => {
                        setEditing(null);
                        setCreating(false);
                        await load();
                    }}
                />
            ) : null}

            {/* Metrics -------------------------------------------------------- */}
            {metricsFor ? <CampaignMetricsModal campaign={metricsFor} onClose={() => setMetricsFor(null)} /> : null}

            {/* Schedule ------------------------------------------------------- */}
            {scheduleFor ? (
                <ScheduleModal
                    campaign={scheduleFor}
                    onClose={() => setScheduleFor(null)}
                    onScheduled={async () => {
                        setScheduleFor(null);
                        await load();
                    }}
                />
            ) : null}

            {/* Test send ------------------------------------------------------ */}
            {testFor ? (
                <TestSendModal
                    campaign={testFor}
                    onClose={() => setTestFor(null)}
                    onSent={() => toast.push('E-mail de teste disparado.', 'success')}
                />
            ) : null}

            {/* Link report ---------------------------------------------------- */}
            <Modal
                open={linksFor !== null}
                onClose={() => setLinksFor(null)}
                title="Verificação de links"
                description={linksFor?.campaign.name}
                width="lg"
            >
                {linksFor ? (
                    linksFor.results.length === 0 ? (
                        <EmptyState title="Nenhum link" message="Esta campanha não contém links absolutos." />
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {linksFor.results.map((result) => (
                                <li
                                    key={result.url}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2"
                                >
                                    <span className="min-w-0 flex-1 break-all text-xs text-[var(--theme-text-muted)]">{result.url}</span>
                                    <Badge tone={result.ok ? 'success' : 'danger'}>
                                        {result.status ?? result.error ?? 'sem resposta'}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )
                ) : null}
            </Modal>

            <ConfirmDialog
                open={deleteTarget !== null}
                title="Arquivar campanha"
                message={`"${deleteTarget?.name ?? ''}" deixará de aparecer na listagem. Os registros de envio e a trilha de auditoria são preservados; o histórico continua consultável no banco.`}
                confirmLabel="Arquivar"
                destructive
                busy={busy}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() =>
                    void runAction(async () => {
                        if (deleteTarget) await archiveCampaign(deleteTarget.id);
                        setDeleteTarget(null);
                    }, 'Campanha arquivada.')
                }
            />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Editor modal
// ---------------------------------------------------------------------------

const CampaignEditorModal: React.FC<{
    campaign: NewsletterCampaign | null;
    templates: NewsletterTemplate[];
    lists: NewsletterList[];
    segments: NewsletterSegment[];
    canWrite: boolean;
    onClose: () => void;
    onSaved: () => Promise<void>;
}> = ({ campaign, templates, lists, segments, canWrite, onClose, onSaved }) => {
    const toast = React.useContext(ToastContext);

    const isNew = campaign === null;

    const [name, setName] = useState(campaign?.name ?? '');
    const [subject, setSubject] = useState(campaign?.subject ?? '');
    const [previewText, setPreviewText] = useState(campaign?.preview_text ?? '');
    const [fromName, setFromName] = useState(campaign?.from_name ?? '');
    const [fromEmail, setFromEmail] = useState(campaign?.from_email ?? '');
    const [replyTo, setReplyTo] = useState(campaign?.reply_to ?? '');
    const [listId, setListId] = useState(campaign?.list_id ?? '');
    const [segmentId, setSegmentId] = useState(campaign?.segment_id ?? '');
    const [blocks, setBlocks] = useState<NewsletterBlock[]>(campaign?.blocks ?? []);
    const [design, setDesign] = useState<NewsletterDesign>(campaign?.design ?? DEFAULT_DESIGN);
    const [abEnabled, setAbEnabled] = useState(campaign?.ab_test_enabled ?? false);
    const [subjectB, setSubjectB] = useState(String(campaign?.ab_config?.subject_b ?? ''));
    const [splitPercent, setSplitPercent] = useState(Number(campaign?.ab_config?.split_percent ?? 50));
    const [versions, setVersions] = useState<{ version: number; change_note: string | null; created_at: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const [audienceCount, setAudienceCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sidebarTab, setSidebarTab] = useState('conteudo');

    useEffect(() => {
        if (!campaign) return;
        void listCampaignVersions(campaign.id)
            .then((rows) =>
                setVersions(
                    rows.map((row) => ({
                        version: row.version,
                        change_note: row.change_note,
                        created_at: row.created_at,
                    })),
                ),
            )
            .catch(() => undefined);
    }, [campaign]);

    const save = async () => {
        setSaving(true);
        setError(null);

        try {
            const payload = {
                name,
                subject,
                preview_text: previewText || null,
                from_name: fromName || null,
                from_email: fromEmail || null,
                reply_to: replyTo || null,
                list_id: listId || null,
                segment_id: segmentId || null,
                blocks,
                design,
                ab_test_enabled: abEnabled,
                ab_config: { subject_b: subjectB, split_percent: splitPercent },
            };

            if (isNew) {
                const created = await createCampaign(payload);
                toast.push('Campanha criada.', 'success');
                await ensureAudience(created.id).catch(() => 0);
            } else {
                await updateCampaign(campaign.id, payload, 'edição no painel');
                toast.push('Campanha atualizada (nova versão registrada).', 'success');
            }

            await onSaved();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'falha ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const buildAudience = async () => {
        if (!campaign) return;
        setSaving(true);
        try {
            const count = await ensureAudience(campaign.id);
            setAudienceCount(count);
            toast.push(`Público recalculado: ${count} destinatário(s).`, 'success');
        } catch (audienceError) {
            toast.push(audienceError instanceof Error ? audienceError.message : 'falha ao calcular público', 'error');
        } finally {
            setSaving(false);
        }
    };

    const applyTemplate = (templateId: string) => {
        const template = templates.find((entry) => entry.id === templateId);
        if (!template) {
            setBlocks([]);
            return;
        }

        setBlocks(template.blocks);
        if (template.subject && !subject) setSubject(template.subject);
        if (template.preview_text && !previewText) setPreviewText(template.preview_text);
        if (template.design) setDesign(template.design);
        toast.push(`Modelo "${template.name}" aplicado.`, 'success');
    };

    const linkCount = extractBlockLinks(blocks).length;

    return (
        <Modal
            open
            onClose={onClose}
            title={isNew ? 'Nova campanha' : `Editar: ${campaign.name}`}
            description="O conteúdo é salvo como uma nova versão a cada edição, preservando o histórico."
            width="xl"
            footer={
                <>
                    <Button onClick={onClose} disabled={saving}>
                        Fechar
                    </Button>
                    {canWrite ? (
                        <>
                            {!isNew ? (
                                <Button onClick={buildAudience} loading={saving}>
                                    Calcular público
                                </Button>
                            ) : null}
                            <Button variant="primary" onClick={save} loading={saving}>
                                Salvar campanha
                            </Button>
                        </>
                    ) : null}
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {error ? <Alert tone="error">{error}</Alert> : null}

                <Tabs
                    tabs={[
                        { id: 'conteudo', label: 'Conteúdo' },
                        { id: 'publico', label: 'Público e remetente' },
                        { id: 'ab', label: 'Teste A/B' },
                        { id: 'historico', label: 'Histórico' },
                    ]}
                    active={sidebarTab}
                    onChange={setSidebarTab}
                    ariaLabel="Configuração da campanha"
                />

                {sidebarTab === 'conteudo' ? (
                    <>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Field label="Nome interno" required hint="Não é enviado ao destinatário.">
                                {(id) => (
                                    <Input
                                        id={id}
                                        value={name}
                                        disabled={!canWrite}
                                        onChange={(event) => setName(event.target.value)}
                                    />
                                )}
                            </Field>

                            <Field label="Aplicar modelo">
                                {(id) => (
                                    <Select id={id} defaultValue="" disabled={!canWrite} onChange={(event) => applyTemplate(event.target.value)}>
                                        <option value="">Selecionar…</option>
                                        {templates.map((template) => (
                                            <option key={template.id} value={template.id}>
                                                {template.name}
                                            </option>
                                        ))}
                                    </Select>
                                )}
                            </Field>

                            <div className="flex items-end">
                                <p className="text-xs text-[var(--theme-text-muted)]">{linkCount} link(s) na campanha</p>
                            </div>
                        </div>

                        <NewsletterEditor
                            blocks={blocks}
                            design={design}
                            subject={subject}
                            previewText={previewText}
                            firmName={fromName || 'Veritas & Lex'}
                            onBlocksChange={setBlocks}
                            onDesignChange={setDesign}
                            onSubjectChange={setSubject}
                            onPreviewTextChange={setPreviewText}
                            renderPreviewHtml={(nextBlocks, nextDesign) => renderPreviewDocument(nextBlocks, nextDesign)}
                            readOnly={!canWrite}
                            canUseRawHtml={canWrite}
                        />
                    </>
                ) : null}

                {sidebarTab === 'publico' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Lista" hint="Base principal do envio.">
                            {(id) => (
                                <Select id={id} value={listId} disabled={!canWrite} onChange={(event) => setListId(event.target.value)}>
                                    <option value="">Todas as listas</option>
                                    {lists.map((list) => (
                                        <option key={list.id} value={list.id}>
                                            {list.name}
                                        </option>
                                    ))}
                                </Select>
                            )}
                        </Field>

                        <Field label="Segmento" hint="Filtro adicional aplicado dentro da lista.">
                            {(id) => (
                                <Select
                                    id={id}
                                    value={segmentId}
                                    disabled={!canWrite}
                                    onChange={(event) => setSegmentId(event.target.value)}
                                >
                                    <option value="">Todos os inscritos</option>
                                    {segments.map((segment) => (
                                        <option key={segment.id} value={segment.id}>
                                            {segment.name}
                                        </option>
                                    ))}
                                </Select>
                            )}
                        </Field>

                        <Field label="Nome do remetente">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={fromName}
                                    disabled={!canWrite}
                                    placeholder="Veritas & Lex"
                                    onChange={(event) => setFromName(event.target.value)}
                                />
                            )}
                        </Field>

                        <Field label="E-mail do remetente">
                            {(id) => (
                                <Input
                                    id={id}
                                    type="email"
                                    value={fromEmail}
                                    disabled={!canWrite}
                                    placeholder="informativo@dominio.com.br"
                                    onChange={(event) => setFromEmail(event.target.value)}
                                />
                            )}
                        </Field>

                        <Field label="Responder para">
                            {(id) => (
                                <Input
                                    id={id}
                                    type="email"
                                    value={replyTo}
                                    disabled={!canWrite}
                                    onChange={(event) => setReplyTo(event.target.value)}
                                />
                            )}
                        </Field>

                        {audienceCount !== null ? (
                            <div className="flex items-end">
                                <Alert tone="info">Público atual: {formatInteger(audienceCount)} destinatário(s).</Alert>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {sidebarTab === 'ab' ? (
                    <div className="flex flex-col gap-3">
                        <Toggle
                            checked={abEnabled}
                            onChange={setAbEnabled}
                            disabled={!canWrite}
                            label="Habilitar teste A/B"
                            hint="Parte do público recebe o assunto B; a variante vencedora é definida pela métrica escolhida."
                        />

                        {abEnabled ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Assunto da variante B">
                                    {(id) => (
                                        <Input id={id} value={subjectB} disabled={!canWrite} onChange={(event) => setSubjectB(event.target.value)} />
                                    )}
                                </Field>

                                <Field label="Percentual que recebe B (%)">
                                    {(id) => (
                                        <Input
                                            id={id}
                                            type="number"
                                            min={5}
                                            max={50}
                                            value={splitPercent}
                                            disabled={!canWrite}
                                            onChange={(event) => setSplitPercent(Number(event.target.value))}
                                        />
                                    )}
                                </Field>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {sidebarTab === 'historico' ? (
                    versions.length === 0 ? (
                        <EmptyState title="Sem histórico" message="Cada salvamento registra uma versão com o estado anterior." />
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {versions.map((version) => (
                                <li key={version.version} className="rounded-lg border border-[var(--theme-border)] px-3 py-2">
                                    <p className="text-sm text-[var(--theme-text-main)]">Versão {version.version}</p>
                                    <p className="text-[11px] text-[var(--theme-text-muted)]">
                                        {version.change_note ?? 'edição'} · {formatDateTime(version.created_at)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )
                ) : null}
            </div>
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const CampaignMetricsModal: React.FC<{ campaign: NewsletterCampaign; onClose: () => void }> = ({
    campaign,
    onClose,
}) => {
    const [rows, setRows] = useState<Awaited<ReturnType<typeof campaignMetrics>>>([]);
    const [variants, setVariants] = useState<VariantMetrics[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void Promise.all([
            campaignMetrics({ limit: 200 }).then((all) => all.filter((row) => row.campaign_id === campaign.id)),
            campaign.ab_test_enabled ? campaignVariantMetrics(campaign.id) : Promise.resolve([]),
            getCampaign(campaign.id).catch(() => null),
        ])
            .then(([metrics, variantMetrics]) => {
                setRows(metrics);
                setVariants(variantMetrics);
            })
            .finally(() => setLoading(false));
    }, [campaign]);

    const row = rows[0];

    return (
        <Modal open onClose={onClose} title={`Métricas: ${campaign.name}`} width="lg">
            {loading ? (
                <Spinner label="Calculando métricas" />
            ) : !row ? (
                <EmptyState
                    title="Sem métricas"
                    message="A campanha ainda não foi enviada, por isso não há indicadores de entrega."
                />
            ) : (
                <div className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <Stat label="Destinatários" value={formatInteger(row.recipients)} />
                        <Stat label="Enviados" value={formatInteger(row.sent)} />
                        <Stat label="Entregues" value={formatInteger(row.delivered)} />
                        <Stat label="Taxa de abertura" value={formatPercent(Number(row.open_rate))} />
                        <Stat label="Taxa de cliques" value={formatPercent(Number(row.click_rate))} />
                        <Stat label="Taxa de bounce" value={formatPercent(Number(row.bounce_rate))} />
                        <Stat label="Descadastros" value={formatInteger(row.unsubscribes)} hint={formatPercent(Number(row.unsubscribe_rate))} />
                        <Stat label="Aberturas únicas" value={formatInteger(row.unique_opens)} />
                        <Stat label="Receita atribuída" value={formatCurrencyFromCents(row.revenue_cents)} />
                    </div>

                    {variants.length > 0 ? (
                        <Card title="Comparativo A/B" subtitle="Desempenho por variante de assunto">
                            <table className="w-full text-sm">
                                <caption className="sr-only">Comparativo entre variantes A e B</caption>
                                <thead>
                                    <tr className="text-left text-[11px] uppercase text-[var(--theme-text-muted)]">
                                        <th scope="col" className="py-1">Variante</th>
                                        <th scope="col" className="py-1">Destinatários</th>
                                        <th scope="col" className="py-1">Taxa de abertura</th>
                                        <th scope="col" className="py-1">Taxa de cliques</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {variants.map((variant) => (
                                        <tr key={variant.variant} className="border-t border-[var(--theme-border)]">
                                            <td className="py-1 uppercase">{variant.variant}</td>
                                            <td className="py-1">{formatInteger(variant.recipients)}</td>
                                            <td className="py-1">{formatPercent(variant.open_rate)}</td>
                                            <td className="py-1">{formatPercent(variant.click_rate)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    ) : null}
                </div>
            )}
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

const ScheduleModal: React.FC<{
    campaign: NewsletterCampaign;
    onClose: () => void;
    onScheduled: () => Promise<void>;
}> = ({ campaign, onClose, onScheduled }) => {
    const toast = React.useContext(ToastContext);
    const [value, setValue] = useState(campaign.scheduled_at?.slice(0, 16) ?? '');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        if (!value) {
            toast.push('Informe data e hora do agendamento.', 'error');
            return;
        }

        setBusy(true);
        try {
            await scheduleCampaign(campaign.id, new Date(value).toISOString());
            toast.push('Campanha agendada.', 'success');
            await onScheduled();
        } catch (scheduleError) {
            toast.push(scheduleError instanceof Error ? scheduleError.message : 'falha ao agendar', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Agendar campanha"
            description="O disparo ocorre no horário definido, respeitando a janela de envio e os limites do provedor."
            footer={
                <>
                    <Button onClick={onClose} disabled={busy}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={submit} loading={busy}>
                        Agendar
                    </Button>
                </>
            }
        >
            <Field label="Data e hora">
                {(id) => (
                    <Input
                        id={id}
                        type="datetime-local"
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                    />
                )}
            </Field>
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Test send
// ---------------------------------------------------------------------------

const TestSendModal: React.FC<{
    campaign: NewsletterCampaign;
    onClose: () => void;
    onSent: () => void;
}> = ({ campaign, onClose, onSent }) => {
    const toast = React.useContext(ToastContext);
    const [to, setTo] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        try {
            await sendTestEmail({ campaignId: campaign.id, to: to || undefined });
            onSent();
            onClose();
        } catch (sendError) {
            toast.push(sendError instanceof Error ? sendError.message : 'falha ao enviar teste', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Enviar teste"
            description="O envio de teste não afeta métricas, contadores nem a lista de destinatários."
            footer={
                <>
                    <Button onClick={onClose} disabled={busy}>
                        Cancelar
                    </Button>
                    <Button variant="primary" onClick={submit} loading={busy}>
                        Enviar teste
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <Field label="Destinatário" hint="Em branco envia para o seu próprio e-mail de acesso.">
                    {(id) => (
                        <Input
                            id={id}
                            type="email"
                            value={to}
                            placeholder="voce@dominio.com.br"
                            onChange={(event) => setTo(event.target.value)}
                        />
                    )}
                </Field>

                <Field label="Observação" hint="Registrada apenas nesta tela, não é enviada.">
                    {(id) => <Textarea id={id} value={note} onChange={(event) => setNote(event.target.value)} />}
                </Field>

                <Alert tone="info">O assunto é prefixado com [TESTE] para evitar confusão com um envio real.</Alert>
            </div>
        </Modal>
    );
};

export default CampaignsManager;
