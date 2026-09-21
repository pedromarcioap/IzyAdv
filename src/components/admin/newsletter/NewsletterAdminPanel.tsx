/**
 * Newsletter back-office shell.
 *
 * Renders as a full-screen workspace launched from the existing CMS drawer.
 * Tabs that the current role cannot use are hidden rather than disabled, and
 * the underlying RPCs/RLS enforce the same rules server-side — the client-side
 * gate is purely a usability affordance.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart3,
    FileStack,
    Layers,
    Mail,
    RefreshCw,
    Settings2,
    ShieldCheck,
    Users,
    X,
} from 'lucide-react';
import type {
    AdminRole,
    CampaignMetricRow,
    DashboardSummary,
    NewsletterAccess,
    NewsletterList,
    NewsletterSegment,
    RecentActivityEntry,
    SendingStatus,
    TimeseriesPoint,
} from '../../../types/newsletter';
import { WRITE_ROLES, CAMPAIGN_STATUS_LABELS } from '../../../types/newsletter';
import {
    campaignMetrics,
    dashboardSummary,
    metricsTimeseries,
    recentActivity,
    refreshDailyStats,
    sendingStatus,
    type Granularity,
} from '../../../lib/newsletter/analytics';
import { listLists, listSegments } from '../../../lib/newsletter/config';
import {
    Alert,
    Badge,
    BarChart,
    Button,
    Card,
    EmptyState,
    Field,
    Input,
    LineChart,
    RateGauge,
    Select,
    Spinner,
    Stat,
    Tabs,
    ToastContext,
    ToastStack,
    cn,
    useToasts,
} from './ui';
import {
    formatCurrencyFromCents,
    formatDateTime,
    formatInteger,
    formatPercent,
} from '../../../lib/newsletter/client';
import { SubscribersManager } from './SubscribersManager';
import { CampaignsManager } from './CampaignsManager';
import { SettingsPanels } from './SettingsPanels';

export interface NewsletterAdminPanelProps {
    isOpen: boolean;
    onClose: () => void;
    /** The authenticated operator's role within the newsletter module. */
    role: AdminRole | null;
    /**
     * Optional pre-loaded access state. If omitted, the panel uses `role` to construct
     * a stub access record for simple environments or stories.
     */
    access?: NewsletterAccess | null;
    /** Re-runs the authorisation check; used by the "verificar novamente" button. */
    onRetryAccess?: () => void;
    /** Whether to render embedded inline inside a container rather than full-screen fixed modal */
    embedded?: boolean;
}

type TabId = 'dashboard' | 'subscribers' | 'campaigns' | 'audiences' | 'settings';

const ALL_TABS: { id: TabId; label: string; icon: React.ReactNode; writeOnly?: boolean; adminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="h-4 w-4" aria-hidden="true" /> },
    { id: 'subscribers', label: 'Inscritos', icon: <Users className="h-4 w-4" aria-hidden="true" /> },
    { id: 'campaigns', label: 'Campanhas', icon: <Mail className="h-4 w-4" aria-hidden="true" /> },
    { id: 'audiences', label: 'Listas e segmentos', icon: <Layers className="h-4 w-4" aria-hidden="true" /> },
    { id: 'settings', label: 'Configurações', icon: <Settings2 className="h-4 w-4" aria-hidden="true" />, adminOnly: true },
];

function dateInputDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function todayInput(): string {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

const PRESETS = [
    { id: '7', label: '7 dias', days: 7 },
    { id: '30', label: '30 dias', days: 30 },
    { id: '90', label: '90 dias', days: 90 },
    { id: '365', label: '12 meses', days: 365 },
];

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

const DashboardView: React.FC<{
    lists: NewsletterList[];
    segments: NewsletterSegment[];
}> = ({ lists, segments }) => {
    const toast = React.useContext(ToastContext);

    const [from, setFrom] = useState(dateInputDaysAgo(30));
    const [to, setTo] = useState(todayInput());
    const [preset, setPreset] = useState('30');
    const [listId, setListId] = useState('');
    const [segmentId, setSegmentId] = useState('');
    const [granularity, setGranularity] = useState<Granularity>('day');

    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [series, setSeries] = useState<TimeseriesPoint[]>([]);
    const [campaigns, setCampaigns] = useState<CampaignMetricRow[]>([]);
    const [activity, setActivity] = useState<RecentActivityEntry[]>([]);
    const [sending, setSending] = useState<SendingStatus | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(
        async (options: { silent?: boolean } = {}) => {
            if (!options.silent) setLoading(true);
            setError(null);

            try {
                // The RPCs expect timestamptz bounds; the picker works in local dates.
                const fromIso = new Date(`${from}T00:00:00.000`).toISOString();
                const toIso = new Date(`${to}T23:59:59.999`).toISOString();

                const [summaryResult, timeseriesResult, campaignResult, activityResult, statusResult] =
                    await Promise.all([
                        dashboardSummary({ from: fromIso, to: toIso, listId: listId || null, segmentId: segmentId || null }),
                        metricsTimeseries(from, to, granularity),
                        campaignMetrics({ from: fromIso, to: toIso, limit: 10 }),
                        recentActivity(15),
                        sendingStatus(),
                    ]);

                setSummary(summaryResult);
                setSeries(timeseriesResult ?? []);
                setCampaigns(campaignResult ?? []);
                setActivity(activityResult ?? []);
                setSending(statusResult);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : 'falha ao carregar o dashboard');
            } finally {
                setLoading(false);
            }
        },
        [from, to, listId, segmentId, granularity],
    );

    useEffect(() => {
        void load();
    }, [load]);

    // Live status: poll while a send is in flight so progress is visible.
    const hasActiveSend = (sending?.campaigns ?? []).length > 0;
    useEffect(() => {
        if (!hasActiveSend) return;
        const timer = window.setInterval(() => {
            void sendingStatus()
                .then(setSending)
                .catch(() => undefined);
        }, 10_000);
        return () => window.clearInterval(timer);
    }, [hasActiveSend]);

    const applyPreset = (id: string) => {
        const found = PRESETS.find((entry) => entry.id === id);
        setPreset(id);
        if (found) {
            setFrom(dateInputDaysAgo(found.days));
            setTo(todayInput());
            setGranularity(found.days > 90 ? 'month' : found.days > 30 ? 'week' : 'day');
        }
    };

    const rebuildRollup = async () => {
        setRefreshing(true);
        try {
            const days = await refreshDailyStats(120);
            toast.push(`Série diária recalculada (${days} dias).`, 'success');
            await load({ silent: true });
        } catch (refreshError) {
            toast.push(
                refreshError instanceof Error ? refreshError.message : 'falha ao recalcular a série',
                'error',
            );
        } finally {
            setRefreshing(false);
        }
    };

    const growthSeries = useMemo(
        () => [
            { name: 'Novos inscritos', points: series.map((point) => ({ label: point.bucket, value: point.new_subscribers })) },
            { name: 'Descadastros', points: series.map((point) => ({ label: point.bucket, value: point.unsubscribes })) },
        ],
        [series],
    );

    const engagementSeries = useMemo(
        () => [
            { name: 'Enviados', points: series.map((point) => ({ label: point.bucket, value: point.emails_sent })) },
            { name: 'Aberturas únicas', points: series.map((point) => ({ label: point.bucket, value: point.unique_opens })) },
            { name: 'Cliques únicos', points: series.map((point) => ({ label: point.bucket, value: point.unique_clicks })) },
        ],
        [series],
    );

    const campaignBars = useMemo(
        () =>
            campaigns
                .filter((row) => row.status === 'sent')
                .slice(0, 8)
                .map((row) => ({ label: row.name, value: Number(row.open_rate) })),
        [campaigns],
    );

    if (loading && !summary) {
        return <Spinner label="Carregando métricas" />;
    }

    return (
        <div className="flex flex-col gap-5">
            {error ? <Alert tone="error">{error}</Alert> : null}

            {/* Filters -------------------------------------------------------- */}
            <Card
                title="Filtros"
                subtitle="O período afeta todos os indicadores, gráficos e comparações abaixo."
                actions={
                    <>
                        <Button
                            size="sm"
                            icon={<RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} aria-hidden="true" />}
                            onClick={rebuildRollup}
                            disabled={refreshing}
                        >
                            Recalcular série
                        </Button>
                        <Button size="sm" onClick={() => void load()}>
                            Aplicar
                        </Button>
                    </>
                }
            >
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                    <Field label="Período">
                        {(id) => (
                            <Select id={id} value={preset} onChange={(event) => applyPreset(event.target.value)}>
                                {PRESETS.map((entry) => (
                                    <option key={entry.id} value={entry.id}>
                                        {entry.label}
                                    </option>
                                ))}
                                <option value="custom">Personalizado</option>
                            </Select>
                        )}
                    </Field>

                    <Field label="De">
                        {(id) => (
                            <Input
                                id={id}
                                type="date"
                                value={from}
                                max={to}
                                onChange={(event) => {
                                    setPreset('custom');
                                    setFrom(event.target.value);
                                }}
                            />
                        )}
                    </Field>

                    <Field label="Até">
                        {(id) => (
                            <Input
                                id={id}
                                type="date"
                                value={to}
                                min={from}
                                onChange={(event) => {
                                    setPreset('custom');
                                    setTo(event.target.value);
                                }}
                            />
                        )}
                    </Field>

                    <Field label="Lista">
                        {(id) => (
                            <Select id={id} value={listId} onChange={(event) => setListId(event.target.value)}>
                                <option value="">Todas as listas</option>
                                {lists.map((list) => (
                                    <option key={list.id} value={list.id}>
                                        {list.name}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>

                    <Field label="Segmento">
                        {(id) => (
                            <Select id={id} value={segmentId} onChange={(event) => setSegmentId(event.target.value)}>
                                <option value="">Todos os inscritos</option>
                                {segments.map((segment) => (
                                    <option key={segment.id} value={segment.id}>
                                        {segment.name}
                                    </option>
                                ))}
                            </Select>
                        )}
                    </Field>
                </div>
            </Card>

            {/* KPIs ----------------------------------------------------------- */}
            {summary ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat
                            label="Inscritos ativos"
                            value={formatInteger(summary.subscribers.active)}
                            hint={`${formatInteger(summary.subscribers.pending)} pendentes de confirmação`}
                        />
                        <Stat
                            label="Novos no período"
                            value={formatInteger(summary.subscribers.new_in_period)}
                            trend={summary.subscribers.growth_rate}
                            hint={`${formatInteger(summary.subscribers.net_growth)} de saldo`}
                        />
                        <Stat
                            label="Descadastros no período"
                            value={formatInteger(summary.subscribers.unsubscribed_in_period)}
                            hint={formatPercent(summary.delivery.unsubscribe_rate) + ' sobre entregues'}
                        />
                        <Stat
                            label="Receita atribuída"
                            value={formatCurrencyFromCents(summary.delivery.revenue_cents)}
                            hint="Conversões rastreadas por campanha"
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Stat label="Campanhas enviadas" value={formatInteger(summary.campaigns.sent)} />
                        <Stat label="Agendadas" value={formatInteger(summary.campaigns.scheduled)} />
                        <Stat label="Em rascunho" value={formatInteger(summary.campaigns.draft)} />
                        <Stat
                            label="Em disparo"
                            value={formatInteger(summary.campaigns.active)}
                            hint={`${formatInteger(summary.campaigns.paused)} pausadas · ${formatInteger(summary.campaigns.failed)} com falha`}
                        />
                    </div>

                    <Card title="Desempenho do período" subtitle="Taxas calculadas sobre e-mails entregues.">
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                            <RateGauge
                                label="Taxa de abertura"
                                value={Number(summary.delivery.open_rate)}
                                hint={`${formatInteger(summary.delivery.unique_opens)} de ${formatInteger(summary.delivery.emails_delivered)} entregues`}
                            />
                            <RateGauge
                                label="Taxa de cliques"
                                value={Number(summary.delivery.click_rate)}
                                hint={`${formatInteger(summary.delivery.unique_clicks)} cliques únicos`}
                            />
                            <RateGauge
                                label="Cliques por abertura"
                                value={Number(summary.delivery.click_to_open_rate)}
                                hint="Indica qualidade do conteúdo"
                            />
                            <RateGauge
                                label="Taxa de bounce"
                                value={Number(summary.delivery.bounce_rate)}
                                hint={`${formatInteger(summary.delivery.bounces)} devolvidos de ${formatInteger(summary.delivery.emails_sent)}`}
                            />
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-3">
                            <Stat label="E-mails enviados" value={formatInteger(summary.delivery.emails_sent)} />
                            <Stat label="Entregues" value={formatInteger(summary.delivery.emails_delivered)} />
                            <Stat
                                label="Reclamações de spam"
                                value={formatInteger(summary.delivery.complaints)}
                                hint="Acima de 0,1% compromete a reputação"
                                tone={summary.delivery.complaints > 0 ? 'danger' : 'success'}
                            />
                        </div>
                    </Card>
                </>
            ) : null}

            {/* Charts --------------------------------------------------------- */}
            <div className="grid gap-5 lg:grid-cols-2">
                <Card
                    title="Crescimento da base"
                    subtitle="Novos inscritos versus descadastros"
                    actions={
                        <Select
                            aria-label="Granularidade"
                            value={granularity}
                            onChange={(event) => setGranularity(event.target.value as Granularity)}
                            className="w-32"
                        >
                            <option value="day">Diário</option>
                            <option value="week">Semanal</option>
                            <option value="month">Mensal</option>
                        </Select>
                    }
                >
                    {series.length === 0 ? (
                        <EmptyState
                            title="Sem dados no período"
                            message="Assim que houver inscrições ou envios, a série aparecerá aqui. Use 'Recalcular série' se os números já deveriam existir."
                        />
                    ) : (
                        <LineChart series={growthSeries} title="Crescimento da base" valueFormatter={formatInteger} />
                    )}
                </Card>

                <Card title="Engajamento" subtitle="Envios, aberturas e cliques ao longo do tempo">
                    {series.length === 0 ? (
                        <EmptyState title="Sem envios no período" message="Os dados aparecem após a primeira campanha enviada." />
                    ) : (
                        <LineChart series={engagementSeries} title="Engajamento" valueFormatter={formatInteger} />
                    )}
                </Card>
            </div>

            <Card title="Comparativo de campanhas" subtitle="Taxa de abertura das últimas campanhas enviadas">
                {campaignBars.length === 0 ? (
                    <EmptyState
                        title="Nenhuma campanha enviada"
                        message="Envie uma campanha para comparar desempenho entre assuntos e formatos."
                    />
                ) : (
                    <BarChart points={campaignBars} title="Taxa de abertura por campanha" valueFormatter={(value) => `${value}%`} />
                )}
            </Card>

            {/* Live sending status + activity --------------------------------- */}
            <div className="grid gap-5 lg:grid-cols-2">
                <Card title="Status de disparo" subtitle="Atualizado automaticamente a cada 10 segundos enquanto houver envio">
                    {sending ? (
                        <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-3 gap-2">
                                <Stat label="Na fila" value={formatInteger(sending.pending_recipients)} />
                                <Stat label="Falhas" value={formatInteger(sending.failed_recipients)} tone={sending.failed_recipients > 0 ? 'warning' : 'neutral'} />
                                <Stat
                                    label="Mensagens na fila pgmq"
                                    value={String((sending.queue?.queue_length as number | undefined) ?? 0)}
                                />
                            </div>

                            {sending.campaigns.length === 0 ? (
                                <p className="text-sm text-[var(--theme-text-muted)]">Nenhum disparo em andamento.</p>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {sending.campaigns.map((campaign) => {
                                        const progress =
                                            campaign.total_recipients > 0
                                                ? Math.round((campaign.sent_count / campaign.total_recipients) * 100)
                                                : 0;

                                        return (
                                            <li key={campaign.id} className="rounded-lg border border-[var(--theme-border)] p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-sm text-[var(--theme-text-main)]">{campaign.name}</span>
                                                    <Badge tone={campaign.status === 'paused' ? 'warning' : 'info'}>
                                                        {CAMPAIGN_STATUS_LABELS[campaign.status as keyof typeof CAMPAIGN_STATUS_LABELS] ??
                                                            campaign.status}
                                                    </Badge>
                                                </div>
                                                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-surface)]">
                                                    <div
                                                        className="h-full rounded-full bg-[var(--theme-gold)] transition-all"
                                                        style={{ width: `${progress}%` }}
                                                    />
                                                </div>
                                                <p className="mt-1 text-[11px] text-[var(--theme-text-muted)]">
                                                    {formatInteger(campaign.sent_count)} de {formatInteger(campaign.total_recipients)} enviados ·{' '}
                                                    {formatInteger(campaign.pending_in_queue)} na fila
                                                    {campaign.failed_in_queue > 0 ? ` · ${campaign.failed_in_queue} com falha` : ''}
                                                </p>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    ) : (
                        <Spinner label="Consultando fila" />
                    )}
                </Card>

                <Card title="Atividades recentes" subtitle="Últimos eventos registrados na base">
                    {activity.length === 0 ? (
                        <EmptyState
                            title="Nenhuma atividade"
                            message="Aberturas, cliques, bounces e descadastros aparecem aqui em tempo real."
                        />
                    ) : (
                        <ul className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                            {activity.map((entry) => (
                                <li
                                    key={entry.event_id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--theme-border)] px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm text-[var(--theme-text-main)]">
                                            {entry.email ?? '—'}
                                            {entry.campaign_name ? (
                                                <span className="text-[var(--theme-text-muted)]"> · {entry.campaign_name}</span>
                                            ) : null}
                                        </p>
                                        <p className="text-[11px] text-[var(--theme-text-muted)]">{formatDateTime(entry.occurred_at)}</p>
                                    </div>
                                    <Badge tone={eventTone(entry.event_type)}>{eventLabel(entry.event_type)}</Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </div>
    );
};

function eventLabel(type: string): string {
    const labels: Record<string, string> = {
        queued: 'Na fila',
        sent: 'Enviado',
        delivered: 'Entregue',
        open: 'Abertura',
        click: 'Clique',
        bounce: 'Bounce',
        complaint: 'Spam',
        unsubscribe: 'Descadastro',
        resubscribe: 'Reinscrição',
        deferred: 'Adiado',
        blocked: 'Bloqueado',
        rejected: 'Rejeitado',
        failed: 'Falha',
    };
    return labels[type] ?? type;
}

function eventTone(type: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
    switch (type) {
        case 'delivered':
        case 'open':
        case 'click':
        case 'resubscribe':
            return 'success';
        case 'bounce':
        case 'complaint':
        case 'failed':
        case 'rejected':
        case 'blocked':
            return 'danger';
        case 'deferred':
        case 'unsubscribe':
            return 'warning';
        default:
            return 'info';
    }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

export const NewsletterAdminPanel: React.FC<NewsletterAdminPanelProps> = ({
    isOpen,
    onClose,
    role,
    access = null,
    onRetryAccess,
    embedded = false,
}) => {
    const canWrite = role !== null && WRITE_ROLES.includes(role);
    const canAdmin = role === 'master_admin' || role === 'admin';

    const [activeTab, setActiveTab] = useState<TabId>('dashboard');
    const [lists, setLists] = useState<NewsletterList[]>([]);
    const [segments, setSegments] = useState<NewsletterSegment[]>([]);
    const [audiencesLoaded, setAudiencesLoaded] = useState(false);

    const { toasts, push, dismiss } = useToasts();
    const containerRef = useRef<HTMLDivElement>(null);

    const tabs = useMemo(
        () =>
            ALL_TABS.filter((tab) => {
                // No resolved role ⇒ no data to show. Rendering empty tabs behind
                // an error banner only invites clicks that fail with 42501.
                if (role === null) return false;
                if (tab.adminOnly && !canAdmin) return false;
                if (tab.id === 'subscribers' && !canWrite && role !== 'analyst') return false;
                if (tab.id === 'campaigns' && !canWrite && role !== 'analyst') return false;
                return true;
            }),
        [canAdmin, canWrite, role],
    );

    const reloadAudiences = useCallback(async () => {
        try {
            const [loadedLists, loadedSegments] = await Promise.all([listLists(), listSegments()]);
            setLists(loadedLists);
            setSegments(loadedSegments);
            setAudiencesLoaded(true);
        } catch (error) {
            push(error instanceof Error ? error.message : 'falha ao carregar listas e segmentos', 'error');
        }
    }, [push]);

    useEffect(() => {
        if (!isOpen && !embedded) return;
        void reloadAudiences();
    }, [isOpen, embedded, reloadAudiences]);

    useEffect(() => {
        if (!isOpen || embedded) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('keydown', onKeyDown);
        document.body.style.overflow = 'hidden';
        containerRef.current?.focus();

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose, embedded]);

    if (!isOpen && !embedded) return null;

    const wrapperClasses = embedded
        ? "w-full flex flex-col bg-[#13060A] border border-[#431520] rounded-xl overflow-hidden shadow-xl min-h-[600px]"
        : "fixed inset-0 z-[60] flex flex-col bg-[var(--theme-bg)]";

    return (
        <ToastContext.Provider value={{ push }}>
            <div className={wrapperClasses} role="dialog" aria-modal={!embedded} aria-label="Painel de newsletter">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--theme-gold)] text-[var(--theme-gold)]">
                            <Mail className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div>
                            <h1 className="font-serif text-lg text-[var(--theme-text-main)]">Informativo</h1>
                            <p className="text-[11px] text-[var(--theme-text-muted)]">
                                {role === null
                                    ? 'Sem acesso ao módulo'
                                    : canWrite
                                        ? 'Acesso de edição'
                                        : canAdmin
                                            ? 'Acesso de leitura administrativa'
                                            : 'Acesso de leitura'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Badge tone={canWrite ? 'gold' : 'neutral'}>
                            <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
                            {role ?? 'sem perfil'}
                        </Badge>
                        {!embedded && (
                            <Button size="sm" variant="ghost" onClick={onClose} icon={<X className="h-4 w-4" aria-hidden="true" />}>
                                Fechar
                            </Button>
                        )}
                    </div>
                </header>

                <div className="border-b border-[var(--theme-border)] bg-[var(--theme-card)] px-5">
                    <Tabs
                        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label, icon: tab.icon }))}
                        active={activeTab}
                        onChange={(id) => setActiveTab(id as TabId)}
                        ariaLabel="Seções do painel de newsletter"
                    />
                </div>

                <div ref={containerRef} tabIndex={-1} className="flex-1 overflow-y-auto p-5">
                    {role === null ? (
                        // access === null means the check is still in flight: showing
                        // the denial banner first would report a failure that has not
                        // happened yet.
                        access === null ? (
                            <Spinner label="Verificando seu acesso ao módulo" />
                        ) : (
                            <Alert tone="error">
                                <div className="space-y-3">
                                    <p className="font-semibold">{access.title}</p>
                                    <p>{access.message}</p>
                                    {access?.remediation ? (
                                        <pre className="whitespace-pre-wrap rounded border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 font-data-mono text-[11px] text-[var(--theme-text-muted)]">
                                            {access.remediation}
                                        </pre>
                                    ) : null}
                                    {onRetryAccess ? (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={onRetryAccess}
                                            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                                        >
                                            Verificar novamente
                                        </Button>
                                    ) : null}
                                </div>
                            </Alert>
                        )
                    ) : (
                        <div
                            id={`panel-${activeTab}`}
                            role="tabpanel"
                            aria-labelledby={`tab-${activeTab}`}
                        >
                            {activeTab === 'dashboard' ? (
                                audiencesLoaded ? (
                                    <DashboardView lists={lists} segments={segments} />
                                ) : (
                                    <Spinner label="Carregando listas" />
                                )
                            ) : null}

                            {activeTab === 'subscribers' ? <SubscribersManager canWrite={canWrite} lists={lists} /> : null}

                            {activeTab === 'campaigns' ? (
                                <CampaignsManager canWrite={canWrite} lists={lists} segments={segments} />
                            ) : null}

                            {activeTab === 'audiences' ? (
                                <SettingsPanels
                                    section="audiences"
                                    role={role}
                                    canWrite={canWrite}
                                    canAdmin={canAdmin}
                                    lists={lists}
                                    segments={segments}
                                    onReloadAudiences={reloadAudiences}
                                />
                            ) : null}

                            {activeTab === 'settings' ? (
                                <SettingsPanels
                                    section="settings"
                                    role={role}
                                    canWrite={canWrite}
                                    canAdmin={canAdmin}
                                    lists={lists}
                                    segments={segments}
                                    onReloadAudiences={reloadAudiences}
                                />
                            ) : null}
                        </div>
                    )}
                </div>

                <ToastStack toasts={toasts} onDismiss={dismiss} />
            </div>
        </ToastContext.Provider>
    );
};

export default NewsletterAdminPanel;
