/**
 * Reusable presentation primitives for the newsletter back office.
 *
 * Deliberately dependency-free: charts are hand-rolled SVG so the bundle does
 * not grow by a charting library for four chart types. Everything here is
 * theme-aware (it reads the existing CSS custom properties) and accessible:
 *   - every control is a real form element or button
 *   - charts expose a text alternative via `role="img"` + `aria-label`, and
 *     render a visually hidden summary table
 *   - dialogs trap focus, close on Escape and restore focus on close
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react';

export function cn(...classes: (string | false | null | undefined)[]): string {
    return classes.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    children,
    className,
    disabled,
    ...rest
}) => {
    const base =
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-gold)] disabled:opacity-50 disabled:cursor-not-allowed';

    const sizes: Record<ButtonSize, string> = {
        sm: 'px-2.5 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
    };

    const variants: Record<ButtonVariant, string> = {
        primary:
            'bg-[var(--theme-primary)] text-white hover:brightness-110 border border-[var(--theme-border)]',
        secondary:
            'bg-[var(--theme-surface)] text-[var(--theme-text-main)] border border-[var(--theme-border)] hover:border-[var(--theme-gold)]',
        ghost:
            'bg-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text-main)] border border-transparent',
        danger: 'bg-red-900/60 text-red-100 border border-red-800 hover:bg-red-900',
    };

    return (
        <button
            type="button"
            className={cn(base, sizes[size], variants[variant], className)}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...rest}
        >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : icon}
            {children}
        </button>
    );
};

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export const Field: React.FC<{
    label: string;
    hint?: string;
    error?: string;
    required?: boolean;
    children: (id: string) => React.ReactNode;
}> = ({ label, hint, error, required, children }) => {
    const id = useId();

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="text-xs font-medium text-[var(--theme-text-muted)]">
                {label}
                {required ? <span className="text-red-400"> *</span> : null}
            </label>
            {children(id)}
            {hint && !error ? <p className="text-[11px] text-[var(--theme-text-muted)]">{hint}</p> : null}
            {error ? (
                <p className="text-[11px] text-red-400" role="alert">
                    {error}
                </p>
            ) : null}
        </div>
    );
};

const controlClass =
    'w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text-main)] placeholder:text-[var(--theme-text-muted)] focus:border-[var(--theme-gold)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--theme-gold)]';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...rest }) => (
    <input className={cn(controlClass, className)} {...rest} />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
    className,
    ...rest
}) => <textarea className={cn(controlClass, 'min-h-[90px] resize-y', className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, ...rest }) => (
    <select className={cn(controlClass, 'cursor-pointer', className)} {...rest} />
);

export const Toggle: React.FC<{
    checked: boolean;
    onChange: (next: boolean) => void;
    label: string;
    hint?: string;
    disabled?: boolean;
}> = ({ checked, onChange, label, hint, disabled }) => {
    const id = useId();

    return (
        <div className="flex items-start gap-3">
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange(!checked)}
                className={cn(
                    'mt-0.5 relative h-5 w-9 flex-shrink-0 rounded-full border transition-colors',
                    checked
                        ? 'bg-[var(--theme-gold)] border-[var(--theme-gold)]'
                        : 'bg-[var(--theme-bg)] border-[var(--theme-border)]',
                    disabled && 'opacity-50 cursor-not-allowed',
                )}
            >
                <span
                    className={cn(
                        'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all',
                        checked ? 'left-[18px]' : 'left-0.5',
                    )}
                />
            </button>
            <div className="flex flex-col">
                <label htmlFor={id} className="text-sm text-[var(--theme-text-main)] cursor-pointer">
                    {label}
                </label>
                {hint ? <span className="text-[11px] text-[var(--theme-text-muted)]">{hint}</span> : null}
            </div>
        </div>
    );
};

export const SearchInput: React.FC<{
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label: string;
}> = ({ value, onChange, placeholder, label }) => (
    <Input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
    />
);

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const Card: React.FC<{
    children: React.ReactNode;
    className?: string;
    title?: string;
    subtitle?: string;
    actions?: React.ReactNode;
}> = ({ children, className, title, subtitle, actions }) => (
    <section
        className={cn(
            'rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm',
            className,
        )}
    >
        {(title || actions) && (
            <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    {title ? (
                        <h3 className="font-serif text-lg text-[var(--theme-text-main)]">{title}</h3>
                    ) : null}
                    {subtitle ? (
                        <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{subtitle}</p>
                    ) : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            </header>
        )}
        {children}
    </section>
);

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

const badgeTones: Record<BadgeTone, string> = {
    neutral: 'bg-[var(--theme-surface)] text-[var(--theme-text-muted)] border-[var(--theme-border)]',
    success: 'bg-emerald-950/50 text-emerald-300 border-emerald-800',
    warning: 'bg-amber-950/50 text-amber-200 border-amber-800',
    danger: 'bg-red-950/50 text-red-300 border-red-800',
    info: 'bg-sky-950/50 text-sky-300 border-sky-800',
    gold: 'bg-[var(--theme-surface)] text-[var(--theme-gold)] border-[var(--theme-gold)]',
};

export const Badge: React.FC<{ children: React.ReactNode; tone?: BadgeTone; className?: string }> = ({
    children,
    tone = 'neutral',
    className,
}) => (
    <span
        className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
            badgeTones[tone],
            className,
        )}
    >
        {children}
    </span>
);

export const Stat: React.FC<{
    label: string;
    value: string;
    hint?: string;
    tone?: BadgeTone;
    trend?: number | null;
}> = ({ label, value, hint, tone = 'neutral', trend }) => (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
        <p className="text-[11px] uppercase tracking-wide text-[var(--theme-text-muted)]">{label}</p>
        <p className="mt-1 font-serif text-2xl text-[var(--theme-text-main)]">{value}</p>
        <div className="mt-1 flex items-center gap-2">
            {trend !== null && trend !== undefined ? (
                <Badge tone={trend >= 0 ? 'success' : 'danger'}>
                    {trend >= 0 ? '+' : ''}
                    {trend.toFixed(2).replace('.', ',')}%
                </Badge>
            ) : null}
            {hint ? <span className="text-[11px] text-[var(--theme-text-muted)]">{hint}</span> : null}
        </div>
    </div>
);

export const EmptyState: React.FC<{ title: string; message: string; action?: React.ReactNode }> = ({
    title,
    message,
    action,
}) => (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--theme-border)] px-6 py-14 text-center">
        <Info className="h-6 w-6 text-[var(--theme-text-muted)]" aria-hidden="true" />
        <h4 className="font-serif text-base text-[var(--theme-text-main)]">{title}</h4>
        <p className="max-w-md text-sm text-[var(--theme-text-muted)]">{message}</p>
        {action}
    </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label = 'Carregando' }) => (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--theme-text-muted)]" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {label}
    </div>
);

export const Alert: React.FC<{ tone?: 'error' | 'info' | 'success'; children: React.ReactNode }> = ({
    tone = 'info',
    children,
}) => {
    const styles = {
        error: 'border-red-800 bg-red-950/40 text-red-200',
        info: 'border-sky-800 bg-sky-950/40 text-sky-200',
        success: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
    } as const;

    const Icon = tone === 'error' ? AlertTriangle : tone === 'success' ? Check : Info;

    return (
        <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', styles[tone])} role="alert">
            <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <div>{children}</div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export interface TabDefinition {
    id: string;
    label: string;
    icon?: React.ReactNode;
    badge?: number;
}

export const Tabs: React.FC<{
    tabs: TabDefinition[];
    active: string;
    onChange: (id: string) => void;
    ariaLabel: string;
}> = ({ tabs, active, onChange, ariaLabel }) => (
    <div className="flex flex-wrap gap-1 border-b border-[var(--theme-border)]" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    id={`tab-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => onChange(tab.id)}
                    className={cn(
                        'flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                        isActive
                            ? 'border-[var(--theme-gold)] text-[var(--theme-text-main)]'
                            : 'border-transparent text-[var(--theme-text-muted)] hover:text-[var(--theme-text-main)]',
                    )}
                >
                    {tab.icon}
                    {tab.label}
                    {tab.badge !== undefined && tab.badge > 0 ? <Badge tone="gold">{tab.badge}</Badge> : null}
                </button>
            );
        })}
    </div>
);

// ---------------------------------------------------------------------------
// Modal (focus-trapped)
// ---------------------------------------------------------------------------

export const Modal: React.FC<{
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    width?: 'md' | 'lg' | 'xl';
}> = ({ open, onClose, title, description, children, footer, width = 'md' }) => {
    const ref = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    const widths = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' } as const;

    useEffect(() => {
        if (!open) return;

        previouslyFocused.current = document.activeElement as HTMLElement | null;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
                return;
            }

            if (event.key !== 'Tab' || !ref.current) return;

            const focusable = ref.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        // Move focus into the dialog so keyboard users are not left behind it.
        window.setTimeout(() => {
            ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
        }, 0);

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            previouslyFocused.current?.focus();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={cn(
                    'w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-2xl',
                    widths[width],
                )}
            >
                <header className="flex items-start justify-between gap-4 border-b border-[var(--theme-border)] px-5 py-4">
                    <div>
                        <h2 className="font-serif text-lg text-[var(--theme-text-main)]">{title}</h2>
                        {description ? (
                            <p className="mt-0.5 text-xs text-[var(--theme-text-muted)]">{description}</p>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Fechar"
                        className="rounded-lg p-1 text-[var(--theme-text-muted)] hover:text-[var(--theme-text-main)] focus-visible:ring-2 focus-visible:ring-[var(--theme-gold)]"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </header>

                <div className="px-5 py-4">{children}</div>

                {footer ? (
                    <footer className="flex flex-wrap justify-end gap-2 border-t border-[var(--theme-border)] px-5 py-3">
                        {footer}
                    </footer>
                ) : null}
            </div>
        </div>
    );
};

export const ConfirmDialog: React.FC<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
}> = ({ open, title, message, confirmLabel = 'Confirmar', destructive, onConfirm, onCancel, busy }) => (
    <Modal
        open={open}
        onClose={onCancel}
        title={title}
        footer={
            <>
                <Button onClick={onCancel} disabled={busy}>
                    Cancelar
                </Button>
                <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
                    {confirmLabel}
                </Button>
            </>
        }
    >
        <p className="text-sm text-[var(--theme-text-muted)]">{message}</p>
    </Modal>
);

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const Pagination: React.FC<{
    page: number;
    totalPages: number;
    total: number;
    pageSize: number;
    onChange: (page: number) => void;
}> = ({ page, totalPages, total, pageSize, onChange }) => {
    if (total === 0) return null;

    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);

    return (
        <nav className="flex flex-wrap items-center justify-between gap-3 pt-3" aria-label="Paginação">
            <p className="text-xs text-[var(--theme-text-muted)]">
                {first}–{last} de {total.toLocaleString('pt-BR')}
            </p>
            <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => onChange(page - 1)} disabled={page <= 1}>
                    Anterior
                </Button>
                <span className="text-xs text-[var(--theme-text-muted)]">
                    Página {page} de {Math.max(totalPages, 1)}
                </span>
                <Button size="sm" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
                    Próxima
                </Button>
            </div>
        </nav>
    );
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

export interface ToastMessage {
    id: number;
    tone: 'success' | 'error' | 'info';
    text: string;
}

export function useToasts() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const counter = useRef(0);

    const push = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
        counter.current += 1;
        const id = counter.current;
        setToasts((current) => [...current, { id, tone, text }]);
        window.setTimeout(() => {
            setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 6000);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
    }, []);

    return { toasts, push, dismiss };
}

export const ToastStack: React.FC<{ toasts: ToastMessage[]; onDismiss: (id: number) => void }> = ({
    toasts,
    onDismiss,
}) => {
    if (toasts.length === 0) return null;

    return (
        <div
            className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-full max-w-sm flex-col gap-2"
            role="status"
            aria-live="polite"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={cn(
                        'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg',
                        toast.tone === 'success' && 'border-emerald-800 bg-emerald-950 text-emerald-100',
                        toast.tone === 'error' && 'border-red-800 bg-red-950 text-red-100',
                        toast.tone === 'info' && 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text-main)]',
                    )}
                >
                    <span className="flex-1">{toast.text}</span>
                    <button
                        type="button"
                        onClick={() => onDismiss(toast.id)}
                        aria-label="Fechar aviso"
                        className="opacity-70 hover:opacity-100"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
            ))}
        </div>
    );
};

export const ToastContext = React.createContext<{ push: (text: string, tone?: ToastMessage['tone']) => void }>({
    push: () => undefined,
});

export const useToast = () => React.useContext(ToastContext);

// ---------------------------------------------------------------------------
// Charts — hand-rolled SVG, no dependency
// ---------------------------------------------------------------------------

export interface SeriesPoint {
    label: string;
    value: number;
}

const CHART_COLORS = ['#D4AF37', '#8FBF9F', '#7EA6E0', '#E08A7E', '#B79FD4'];

function niceMax(value: number): number {
    if (value <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
    return Math.ceil(value / magnitude) * magnitude;
}

/**
 * Multi-series line chart.
 * The value axis is included as a visually hidden table so screen-reader users
 * get the same information as sighted ones.
 */
export const LineChart: React.FC<{
    series: { name: string; points: SeriesPoint[] }[];
    title: string;
    height?: number;
    valueFormatter?: (value: number) => string;
}> = ({ series, title, height = 220, valueFormatter = (value) => String(value) }) => {
    const width = 720;
    const padding = { top: 16, right: 16, bottom: 28, left: 48 };

    const pointCount = Math.max(...series.map((entry) => entry.points.length), 0);
    const maxValue = niceMax(Math.max(...series.flatMap((entry) => entry.points.map((point) => point.value)), 0));

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const xFor = (index: number) =>
        padding.left + (pointCount <= 1 ? plotWidth / 2 : (index / (pointCount - 1)) * plotWidth);
    const yFor = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;

    const labels = series[0]?.points.map((point) => point.label) ?? [];
    const tickCount = 4;

    return (
        <figure className="m-0">
            <figcaption className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[var(--theme-text-muted)]">
                {series.map((entry, index) => (
                    <span key={entry.name} className="inline-flex items-center gap-1.5">
                        <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                            aria-hidden="true"
                        />
                        {entry.name}
                    </span>
                ))}
            </figcaption>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                width="100%"
                height={height}
                role="img"
                aria-label={`${title}. ${series.map((entry) => entry.name).join(', ')}`}
                preserveAspectRatio="none"
            >
                {/* Horizontal grid + value axis */}
                {Array.from({ length: tickCount + 1 }).map((_, tick) => {
                    const value = (maxValue / tickCount) * tick;
                    const y = yFor(value);
                    return (
                        <g key={tick}>
                            <line
                                x1={padding.left}
                                x2={width - padding.right}
                                y1={y}
                                y2={y}
                                stroke="var(--theme-border)"
                                strokeWidth={1}
                                strokeDasharray={tick === 0 ? undefined : '3 4'}
                            />
                            <text
                                x={padding.left - 8}
                                y={y + 3}
                                textAnchor="end"
                                fontSize={10}
                                fill="var(--theme-text-muted)"
                            >
                                {value >= 1000 ? `${Math.round(value / 1000)}k` : Math.round(value)}
                            </text>
                        </g>
                    );
                })}

                {/* Series */}
                {series.map((entry, seriesIndex) => {
                    const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
                    const line = entry.points
                        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.value)}`)
                        .join(' ');

                    return (
                        <g key={entry.name}>
                            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                            {entry.points.map((point, index) => (
                                <circle key={`${entry.name}-${index}`} cx={xFor(index)} cy={yFor(point.value)} r={2.5} fill={color}>
                                    <title>{`${entry.name} · ${point.label}: ${valueFormatter(point.value)}`}</title>
                                </circle>
                            ))}
                        </g>
                    );
                })}

                {/* X axis labels — thinned to avoid overlap */}
                {labels.map((label, index) => {
                    const step = Math.ceil(pointCount / 7);
                    if (index % step !== 0 && index !== pointCount - 1) return null;
                    return (
                        <text
                            key={`${label}-${index}`}
                            x={xFor(index)}
                            y={height - 8}
                            textAnchor="middle"
                            fontSize={10}
                            fill="var(--theme-text-muted)"
                        >
                            {label.length > 6 ? label.slice(5) : label}
                        </text>
                    );
                })}
            </svg>

            <table className="sr-only">
                <caption>{title}</caption>
                <thead>
                    <tr>
                        <th scope="col">Período</th>
                        {series.map((entry) => (
                            <th key={entry.name} scope="col">
                                {entry.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {labels.map((label, rowIndex) => (
                        <tr key={`${label}-${rowIndex}`}>
                            <th scope="row">{label}</th>
                            {series.map((entry) => (
                                <td key={entry.name}>{valueFormatter(entry.points[rowIndex]?.value ?? 0)}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
};

export const BarChart: React.FC<{
    points: SeriesPoint[];
    title: string;
    height?: number;
    valueFormatter?: (value: number) => string;
}> = ({ points, title, height = 220, valueFormatter = (value) => String(value) }) => {
    const maxValue = niceMax(Math.max(...points.map((point) => point.value), 0));

    return (
        <figure className="m-0">
            <svg
                viewBox={`0 0 720 ${height}`}
                width="100%"
                height={height}
                role="img"
                aria-label={title}
                preserveAspectRatio="none"
            >
                {points.map((point, index) => {
                    const barWidth = 720 / Math.max(points.length, 1);
                    const barHeight = (point.value / maxValue) * (height - 40);

                    return (
                        <g key={`${point.label}-${index}`}>
                            <rect
                                x={index * barWidth + barWidth * 0.15}
                                y={height - 24 - barHeight}
                                width={barWidth * 0.7}
                                height={Math.max(barHeight, 1)}
                                rx={3}
                                fill={CHART_COLORS[index % CHART_COLORS.length]}
                            >
                                <title>{`${point.label}: ${valueFormatter(point.value)}`}</title>
                            </rect>
                            <text
                                x={index * barWidth + barWidth / 2}
                                y={height - 8}
                                textAnchor="middle"
                                fontSize={10}
                                fill="var(--theme-text-muted)"
                            >
                                {point.label.length > 10 ? `${point.label.slice(0, 9)}…` : point.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </figure>
    );
};

export const RateGauge: React.FC<{
    label: string;
    value: number;
    max?: number;
    hint?: string;
}> = ({ label, value, max = 100, hint }) => {
    const safeValue = Math.max(0, Math.min(value, max));
    const percentage = (safeValue / max) * 100;
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const dash = (percentage / 100) * circumference;

    return (
        <div className="flex items-center gap-3">
            <svg width={84} height={84} role="img" aria-label={`${label}: ${value}%`}>
                <circle cx={42} cy={42} r={radius} fill="none" stroke="var(--theme-border)" strokeWidth={8} />
                <circle
                    cx={42}
                    cy={42}
                    r={radius}
                    fill="none"
                    stroke="#D4AF37"
                    strokeWidth={8}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={circumference / 4}
                    strokeLinecap="round"
                    transform="rotate(-90 42 42)"
                />
                <text x={42} y={46} textAnchor="middle" fontSize={13} fill="var(--theme-text-main)">
                    {value.toFixed(1).replace('.', ',')}%
                </text>
            </svg>
            <div>
                <p className="text-sm text-[var(--theme-text-main)]">{label}</p>
                {hint ? <p className="text-[11px] text-[var(--theme-text-muted)]">{hint}</p> : null}
            </div>
        </div>
    );
};

/** Small inline sparkline used inside table rows. */
export const Sparkline: React.FC<{ points: number[]; label: string }> = ({ points, label }) => {
    const path = useMemo(() => {
        if (points.length === 0) return '';
        const max = Math.max(...points, 1);
        return points
            .map((value, index) => {
                const x = (index / Math.max(points.length - 1, 1)) * 100;
                const y = 24 - (value / max) * 22;
                return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
            })
            .join(' ');
    }, [points]);

    if (!path) return <span className="text-[11px] text-[var(--theme-text-muted)]">—</span>;

    return (
        <svg width={100} height={26} role="img" aria-label={label}>
            <path d={path} fill="none" stroke="#D4AF37" strokeWidth={1.5} />
        </svg>
    );
};
