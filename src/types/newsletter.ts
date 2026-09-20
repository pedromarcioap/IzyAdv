/**
 * Newsletter domain types.
 *
 * These mirror the Postgres enums and table shapes one-to-one. The block union
 * is duplicated in `supabase/functions/_shared/render.ts` (the Edge runtime
 * cannot import from `src/`); when adding a block type, update both.
 */

export type AdminRole = 'master_admin' | 'admin' | 'editor' | 'analyst' | 'viewer';

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
    master_admin: 'Master Admin',
    admin: 'Administrador',
    editor: 'Editor',
    analyst: 'Analista',
    viewer: 'Leitor',
};

/** Roles allowed to create/change content, mirrored by RLS and the Edge Functions. */
export const WRITE_ROLES: AdminRole[] = ['master_admin', 'admin', 'editor'];

/**
 * Why the newsletter module is (or is not) available to the current visitor.
 *
 * The module has four independent preconditions — a configured client, a
 * Supabase session, a row in public.admin_profiles and is_active = true — and
 * each failure needs a different fix from a different person (developer,
 * operator, administrator). Collapsing them into a single message sends people
 * after the wrong problem, so the state is tracked explicitly.
 *
 *   unconfigured → VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing
 *   no_session   → client works, but there is no auth.uid() to authorise
 *   no_profile   → the account exists, yet the module has never seen it
 *   inactive     → the profile exists and was deliberately switched off
 *   query_failed → the database/API could not answer (RLS, network, schema)
 *   active       → usable; `role` carries the authorisation level
 */
export type NewsletterAccessState =
    | 'unconfigured'
    | 'no_session'
    | 'no_profile'
    | 'inactive'
    | 'query_failed'
    | 'active';

export interface NewsletterAccess {
    state: NewsletterAccessState;
    /** Authorisation level, present only when state is 'active'. */
    role: AdminRole | null;
    /** Short headline describing the exact failure. */
    title: string;
    /** Operator-facing explanation of what is missing. */
    message: string;
    /** Optional SQL/steps that unblock the situation. */
    remediation?: string;
}

export type SubscriberStatus =
    | 'pending'
    | 'active'
    | 'unsubscribed'
    | 'bounced'
    | 'complained'
    | 'cleaned';

export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberStatus, string> = {
    pending: 'Pendente',
    active: 'Ativo',
    unsubscribed: 'Descadastrado',
    bounced: 'Bounce',
    complained: 'Spam',
    cleaned: 'Anonimizado',
};

export type ConsentSource =
    | 'website_form'
    | 'landing_page'
    | 'admin_import'
    | 'api'
    | 'event'
    | 'referral'
    | 'partner'
    | 'other';

export const CONSENT_SOURCE_LABELS: Record<ConsentSource, string> = {
    website_form: 'Formulário do site',
    landing_page: 'Landing page',
    admin_import: 'Importação manual',
    api: 'API',
    event: 'Evento',
    referral: 'Indicação',
    partner: 'Parceiro',
    other: 'Outro',
};

export type CampaignStatus =
    | 'draft'
    | 'scheduled'
    | 'queued'
    | 'sending'
    | 'paused'
    | 'sent'
    | 'canceled'
    | 'failed';

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
    draft: 'Rascunho',
    scheduled: 'Agendada',
    queued: 'Na fila',
    sending: 'Enviando',
    paused: 'Pausada',
    sent: 'Enviada',
    canceled: 'Cancelada',
    failed: 'Falhou',
};

export type RecipientStatus =
    | 'queued'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'opened'
    | 'clicked'
    | 'bounced'
    | 'complained'
    | 'unsubscribed'
    | 'failed'
    | 'skipped';

export type NewsletterEventType =
    | 'queued'
    | 'sent'
    | 'delivered'
    | 'open'
    | 'click'
    | 'bounce'
    | 'complaint'
    | 'unsubscribe'
    | 'resubscribe'
    | 'deferred'
    | 'blocked'
    | 'rejected'
    | 'failed';

export type ProviderKind = 'resend' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses' | 'postmark';

export const PROVIDER_LABELS: Record<ProviderKind, string> = {
    resend: 'Resend (API)',
    smtp: 'SMTP genérico',
    sendgrid: 'SendGrid',
    mailgun: 'Mailgun',
    ses: 'Amazon SES (não implementado)',
    postmark: 'Postmark',
};

// ---------------------------------------------------------------------------
// Editor blocks
// ---------------------------------------------------------------------------

export type Alignment = 'left' | 'center' | 'right';
export type BlockType =
    | 'heading'
    | 'text'
    | 'image'
    | 'button'
    | 'divider'
    | 'spacer'
    | 'columns'
    | 'video'
    | 'html';

export interface BlockBase {
    id: string;
    type: BlockType;
}

export interface HeadingBlock extends BlockBase {
    type: 'heading';
    text: string;
    level: 1 | 2 | 3;
    align: Alignment;
    color?: string;
    fontSize?: number;
}

export interface TextBlock extends BlockBase {
    type: 'text';
    html: string;
    align: Alignment;
    color?: string;
    fontSize?: number;
    lineHeight?: number;
}

export interface ImageBlock extends BlockBase {
    type: 'image';
    src: string;
    alt?: string;
    href?: string;
    width?: number;
    align: Alignment;
    borderRadius?: number;
    paddingY?: number;
}

export interface ButtonBlock extends BlockBase {
    type: 'button';
    label: string;
    href: string;
    align: Alignment;
    bgColor?: string;
    textColor?: string;
    borderRadius?: number;
    fullWidth?: boolean;
}

export interface DividerBlock extends BlockBase {
    type: 'divider';
    color?: string;
    thickness?: number;
    width?: number;
}

export interface SpacerBlock extends BlockBase {
    type: 'spacer';
    height?: number;
}

export interface ColumnsBlock extends BlockBase {
    type: 'columns';
    gap?: number;
    columns: { width?: number; blocks: NewsletterBlock[] }[];
}

export interface VideoBlock extends BlockBase {
    type: 'video';
    url: string;
    thumbnail?: string;
    title?: string;
}

export interface HtmlBlock extends BlockBase {
    type: 'html';
    html: string;
}

export type NewsletterBlock =
    | HeadingBlock
    | TextBlock
    | ImageBlock
    | ButtonBlock
    | DividerBlock
    | SpacerBlock
    | ColumnsBlock
    | VideoBlock
    | HtmlBlock;

export interface NewsletterDesign {
    backgroundColor?: string;
    contentBackgroundColor?: string;
    textColor?: string;
    linkColor?: string;
    fontFamily?: string;
    contentWidth?: number;
    borderRadius?: number;
    buttonBgColor?: string;
    buttonTextColor?: string;
}

export const DEFAULT_DESIGN: Required<NewsletterDesign> = {
    backgroundColor: '#f4f4f5',
    contentBackgroundColor: '#ffffff',
    textColor: '#1f2937',
    linkColor: '#8a6a1f',
    fontFamily: 'Georgia, "Times New Roman", serif',
    contentWidth: 640,
    borderRadius: 8,
    buttonBgColor: '#581825',
    buttonTextColor: '#ffffff',
};

export const BLOCK_LABELS: Record<BlockType, string> = {
    heading: 'Título',
    text: 'Texto',
    image: 'Imagem',
    button: 'Botão',
    divider: 'Divisor',
    spacer: 'Espaçamento',
    columns: 'Colunas',
    video: 'Vídeo',
    html: 'HTML personalizado',
};

/** Blocks that only editors and above may insert (raw markup). */
export const RESTRICTED_BLOCKS: BlockType[] = ['html', 'video'];

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface NewsletterList {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    is_default: boolean;
    double_opt_in: boolean;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface NewsletterTag {
    id: string;
    name: string;
    color: string;
    description: string | null;
    created_at: string;
}

export interface SegmentCondition {
    field: string;
    operator: string;
    value?: unknown;
}

export interface SegmentRules {
    match: 'all' | 'any';
    conditions: SegmentCondition[];
}

export interface NewsletterSegment {
    id: string;
    name: string;
    description: string | null;
    rules: SegmentRules;
    is_dynamic: boolean;
    cached_count: number;
    cached_at: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface NewsletterSubscriber {
    id: string;
    email: string;
    name: string | null;
    status: SubscriberStatus;
    phone: string | null;
    company: string | null;
    job_title: string | null;
    preference_area: string;
    locale: string;
    timezone: string;
    source: ConsentSource;
    source_detail: string | null;
    consent_given_at: string | null;
    consent_ip: string | null;
    consent_text: string | null;
    confirmed_at: string | null;
    unsubscribed_at: string | null;
    unsubscribe_reason: string | null;
    bounce_count: number;
    last_event_at: string | null;
    engagement_score: number;
    custom_fields: Record<string, unknown>;
    notes: string | null;
    anonymized_at: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface SubscriberOverviewRow {
    id: string;
    email: string;
    name: string | null;
    status: SubscriberStatus;
    source: ConsentSource;
    preference_area: string;
    created_at: string;
    confirmed_at: string | null;
    unsubscribed_at: string | null;
    last_event_at: string | null;
    engagement_score: number;
    bounce_count: number;
    tags: string[];
    total_opens: number;
    total_clicks: number;
}

export interface NewsletterTemplate {
    id: string;
    name: string;
    description: string | null;
    category: string;
    subject: string;
    preview_text: string | null;
    blocks: NewsletterBlock[];
    design: NewsletterDesign;
    html: string | null;
    is_archived: boolean;
    version: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface AbConfig {
    split_percent?: number;
    subject_b?: string;
    test_window_minutes?: number;
    winner_metric?: 'open_rate' | 'click_rate';
}

export interface NewsletterCampaign {
    id: string;
    name: string;
    subject: string;
    preview_text: string | null;
    from_name: string | null;
    from_email: string | null;
    reply_to: string | null;
    list_id: string | null;
    segment_id: string | null;
    template_id: string | null;
    blocks: NewsletterBlock[];
    design: NewsletterDesign;
    html: string | null;
    status: CampaignStatus;
    scheduled_at: string | null;
    scheduled_timezone: string;
    started_at: string | null;
    paused_at: string | null;
    completed_at: string | null;
    canceled_at: string | null;
    last_error: string | null;
    total_recipients: number;
    sent_count: number;
    delivered_count: number;
    open_count: number;
    unique_open_count: number;
    click_count: number;
    unique_click_count: number;
    bounce_count: number;
    complaint_count: number;
    unsubscribe_count: number;
    revenue_cents: number;
    ab_test_enabled: boolean;
    ab_config: AbConfig;
    ab_winner_variant: 'a' | 'b' | null;
    ab_decided_at: string | null;
    version: number;
    duplicated_from: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface CampaignVersion {
    id: string;
    campaign_id: string;
    version: number;
    snapshot: Partial<NewsletterCampaign>;
    change_note: string | null;
    created_at: string;
}

export interface NewsletterProvider {
    id: string;
    name: string;
    kind: ProviderKind;
    is_active: boolean;
    is_default: boolean;
    from_name: string | null;
    from_email: string | null;
    reply_to: string | null;
    config: Record<string, unknown>;
    secret_ref: string | null;
    webhook_secret_ref: string | null;
    daily_limit: number | null;
    hourly_limit: number | null;
    per_second_limit: number;
    priority: number;
    created_at: string;
    updated_at: string;
}

export interface NewsletterSettings {
    id: number;
    default_from_name: string;
    default_from_email: string;
    default_reply_to: string | null;
    default_list_id: string | null;
    double_opt_in_enabled: boolean;
    unsubscribe_footer: string | null;
    physical_address: string | null;
    privacy_policy_url: string | null;
    gdpr_contact_email: string | null;
    retry_max_attempts: number;
    retry_backoff_seconds: number;
    throttle_per_second: number;
    daily_send_limit: number | null;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    allowed_weekdays: number[];
    tracking_opens: boolean;
    tracking_clicks: boolean;
    utm_source: string;
    utm_medium: string;
    utm_campaign_prefix: string;
    updated_at: string;
}

export interface AdminProfile {
    user_id: string;
    email: string;
    full_name: string | null;
    role: AdminRole;
    is_active: boolean;
    phone: string | null;
    last_seen_at: string | null;
    invited_at: string | null;
    accepted_at: string | null;
    created_at: string;
}

export interface AuditLogEntry {
    id: number;
    actor_id: string | null;
    actor_email: string | null;
    actor_role: AdminRole | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    summary: string | null;
    changes: Record<string, unknown>;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
}

export interface SubscriberTimelineEntry {
    event_id: number;
    event_type: NewsletterEventType;
    campaign_id: string | null;
    campaign_name: string | null;
    url: string | null;
    reason: string | null;
    occurred_at: string;
}

export interface RecentActivityEntry {
    event_id: number;
    event_type: NewsletterEventType;
    subscriber_id: string | null;
    email: string | null;
    campaign_id: string | null;
    campaign_name: string | null;
    url: string | null;
    reason: string | null;
    occurred_at: string;
}

// ---------------------------------------------------------------------------
// Analytics payloads (returned by the dashboard RPCs)
// ---------------------------------------------------------------------------

export interface DashboardSummary {
    period: { from: string; to: string };
    subscribers: {
        active: number;
        pending: number;
        unsubscribed: number;
        bounced: number;
        complained: number;
        new_in_period: number;
        unsubscribed_in_period: number;
        active_at_start: number;
        growth_rate: number | null;
        net_growth: number;
    };
    campaigns: {
        sent: number;
        scheduled: number;
        draft: number;
        active: number;
        paused: number;
        failed: number;
    };
    delivery: {
        emails_sent: number;
        emails_delivered: number;
        opens: number;
        unique_opens: number;
        clicks: number;
        unique_clicks: number;
        bounces: number;
        complaints: number;
        unsubscribes: number;
        revenue_cents: number;
        open_rate: number;
        click_rate: number;
        click_to_open_rate: number;
        bounce_rate: number;
        unsubscribe_rate: number;
        delivery_rate: number;
    };
}

export interface TimeseriesPoint {
    bucket: string;
    new_subscribers: number;
    unsubscribes: number;
    emails_sent: number;
    emails_delivered: number;
    opens: number;
    unique_opens: number;
    clicks: number;
    unique_clicks: number;
    bounces: number;
    revenue_cents: number;
}

export interface CampaignMetricRow {
    campaign_id: string;
    name: string;
    subject: string;
    status: string;
    scheduled_at: string | null;
    completed_at: string | null;
    recipients: number;
    sent: number;
    delivered: number;
    unique_opens: number;
    unique_clicks: number;
    bounces: number;
    unsubscribes: number;
    revenue_cents: number;
    open_rate: number;
    click_rate: number;
    bounce_rate: number;
    unsubscribe_rate: number;
}

export interface SendingStatus {
    queue: Record<string, unknown> | null;
    dead_letter_queue: Record<string, unknown> | null;
    pending_recipients: number;
    failed_recipients: number;
    campaigns: {
        id: string;
        name: string;
        status: string;
        total_recipients: number;
        sent_count: number;
        delivered_count: number;
        bounce_count: number;
        started_at: string | null;
        scheduled_at: string | null;
        pending_in_queue: number;
        failed_in_queue: number;
    }[];
    generated_at: string;
}

export interface SegmentPreviewRow {
    subscriber_id: string;
    email: string;
    full_name: string | null;
    status: string;
    source: string;
}
