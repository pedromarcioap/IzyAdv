/**
 * Visual newsletter editor.
 *
 * Drag and drop uses the native HTML5 API so no drag library is added to the
 * bundle. Keyboard users are not excluded: every block can be moved with the
 * arrow buttons in its toolbar, which is also the accessible fallback when a
 * drag operation is impossible (for example on touch devices).
 *
 * The preview is an iframe using `srcDoc`, so the newsletter's own CSS cannot
 * leak into the admin panel and vice versa.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Code2,
    Columns3,
    Copy,
    GripVertical,
    Heading2,
    Image as ImageIcon,
    Link2,
    Minus,
    MousePointerClick,
    Plus,
    Trash2,
    Type,
    Video,
} from 'lucide-react';
import type { Alignment, BlockType, NewsletterBlock, NewsletterDesign } from '../../../types/newsletter';
import { BLOCK_LABELS, DEFAULT_DESIGN } from '../../../types/newsletter';
import { validateBlocks } from '../../../lib/newsletter/validation';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea, Toggle, cn } from './ui';

export interface NewsletterEditorProps {
    blocks: NewsletterBlock[];
    design: NewsletterDesign;
    subject: string;
    previewText: string;
    firmName: string;
    onBlocksChange: (blocks: NewsletterBlock[]) => void;
    onDesignChange: (design: NewsletterDesign) => void;
    onSubjectChange: (subject: string) => void;
    onPreviewTextChange: (value: string) => void;
    /** Raw HTML rendered server-side or client-side for preview. */
    renderPreviewHtml: (blocks: NewsletterBlock[], design: NewsletterDesign) => string;
    readOnly?: boolean;
    canUseRawHtml?: boolean;
}

const PALETTE: { type: BlockType; icon: React.ReactNode }[] = [
    { type: 'heading', icon: <Heading2 className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'text', icon: <Type className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'image', icon: <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'button', icon: <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'divider', icon: <Minus className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'spacer', icon: <Minus className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'columns', icon: <Columns3 className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'video', icon: <Video className="h-3.5 w-3.5" aria-hidden="true" /> },
    { type: 'html', icon: <Code2 className="h-3.5 w-3.5" aria-hidden="true" /> },
];

export function createBlock(type: BlockType): NewsletterBlock {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    switch (type) {
        case 'heading':
            return { id, type, text: 'Título da seção', level: 2, align: 'left' };
        case 'text':
            return {
                id,
                type,
                html: '<p>Escreva o conteúdo do informativo. Use {{subscriber.name}} para personalizar.</p>',
                align: 'left',
            };
        case 'image':
            return { id, type, src: 'https://', alt: '', align: 'center', width: 600, borderRadius: 6 };
        case 'button':
            return { id, type, label: 'Ler a análise completa', href: 'https://', align: 'center' };
        case 'divider':
            return { id, type, color: '#e5e7eb', thickness: 1, width: 100 };
        case 'spacer':
            return { id, type, height: 24 };
        case 'columns':
            return {
                id,
                type,
                gap: 16,
                columns: [{ blocks: [createBlock('text')] }, { blocks: [createBlock('text')] }],
            };
        case 'video':
            return { id, type, url: 'https://', title: '' };
        case 'html':
            return { id, type, html: '<div><p>HTML personalizado</p></div>' };
        default:
            return { id, type: 'text', html: '', align: 'left' };
    }
}

export const NewsletterEditor: React.FC<NewsletterEditorProps> = ({
    blocks,
    design,
    subject,
    previewText,
    firmName,
    onBlocksChange,
    onDesignChange,
    onSubjectChange,
    onPreviewTextChange,
    renderPreviewHtml,
    readOnly = false,
    canUseRawHtml = true,
}) => {
    const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null);
    const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
    const [htmlMode, setHtmlMode] = useState(false);
    const [htmlDraft, setHtmlDraft] = useState('');
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [overIndex, setOverIndex] = useState<number | null>(null);
    const [designOpen, setDesignOpen] = useState(false);
    const canvasRef = useRef<HTMLDivElement>(null);

    const issues = useMemo(() => validateBlocks(blocks), [blocks]);
    const selected = useMemo(() => blocks.find((block) => block.id === selectedId) ?? null, [blocks, selectedId]);
    const previewHtml = useMemo(
        () => renderPreviewHtml(blocks, { ...DEFAULT_DESIGN, ...design }),
        [blocks, design, renderPreviewHtml],
    );

    const update = useCallback(
        (next: NewsletterBlock[]) => {
            onBlocksChange(next);
        },
        [onBlocksChange],
    );

    const patchSelected = (patch: Record<string, unknown>) => {
        if (!selected) return;
        update(blocks.map((block) => (block.id === selected.id ? ({ ...block, ...patch } as NewsletterBlock) : block)));
    };

    const addBlock = (type: BlockType) => {
        const block = createBlock(type);
        update([...blocks, block]);
        setSelectedId(block.id);
        // Scroll the new block into view so the operator sees the result.
        window.setTimeout(() => {
            canvasRef.current?.querySelector<HTMLElement>(`[data-block-id="${block.id}"]`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }, 50);
    };

    const removeBlock = (id: string) => {
        const next = blocks.filter((block) => block.id !== id);
        update(next);
        if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    };

    const duplicateBlock = (id: string) => {
        const index = blocks.findIndex((block) => block.id === id);
        if (index < 0) return;

        const source = blocks[index];
        const copy = { ...source, id: `${source.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } as NewsletterBlock;
        const next = [...blocks];
        next.splice(index + 1, 0, copy);
        update(next);
        setSelectedId(copy.id);
    };

    const move = (id: string, direction: -1 | 1) => {
        const index = blocks.findIndex((block) => block.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= blocks.length) return;

        const next = [...blocks];
        [next[index], next[target]] = [next[target], next[index]];
        update(next);
    };

    const onDrop = (targetIndex: number) => {
        if (dragIndex === null || dragIndex === targetIndex) {
            setDragIndex(null);
            setOverIndex(null);
            return;
        }

        const next = [...blocks];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(targetIndex, 0, moved);
        update(next);
        setDragIndex(null);
        setOverIndex(null);
    };

    useEffect(() => {
        if (htmlMode) setHtmlDraft(previewHtml);
    }, [htmlMode, previewHtml]);

    return (
        <div className="flex flex-col gap-4">
            {/* Header fields ------------------------------------------------- */}
            <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Assunto" required hint="Use {{subscriber.name}} para personalizar.">
                    {(id) => (
                        <Input id={id} value={subject} onChange={(event) => onSubjectChange(event.target.value)} readOnly={readOnly} />
                    )}
                </Field>

                <Field label="Texto de pré-visualização" hint="Aparece na caixa de entrada ao lado do assunto.">
                    {(id) => (
                        <Input
                            id={id}
                            value={previewText}
                            onChange={(event) => onPreviewTextChange(event.target.value)}
                            readOnly={readOnly}
                        />
                    )}
                </Field>
            </div>

            {issues.length > 0 ? (
                <Alert tone="error">
                    <p className="font-medium">Corrija antes de enviar:</p>
                    <ul className="mt-1 list-inside list-disc">
                        {issues.slice(0, 6).map((issue, index) => (
                            <li key={index}>{issue}</li>
                        ))}
                    </ul>
                </Alert>
            ) : (
                <Alert tone="success">Conteúdo validado: nenhum problema estrutural encontrado.</Alert>
            )}

            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                {/* Palette ------------------------------------------------------ */}
                <aside className="flex flex-col gap-3">
                    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
                        <h4 className="mb-2 text-xs uppercase tracking-wide text-[var(--theme-text-muted)]">Blocos</h4>
                        <div className="grid grid-cols-2 gap-2">
                            {PALETTE.map((entry) => {
                                const restricted = entry.type === 'html' && !canUseRawHtml;
                                return (
                                    <button
                                        key={entry.type}
                                        type="button"
                                        disabled={readOnly || restricted}
                                        title={restricted ? 'Disponível apenas para editores' : BLOCK_LABELS[entry.type]}
                                        onClick={() => addBlock(entry.type)}
                                        className={cn(
                                            'flex flex-col items-center gap-1 rounded-lg border border-[var(--theme-border)] px-2 py-3 text-[11px] text-[var(--theme-text-muted)] transition-colors',
                                            !readOnly && !restricted && 'hover:border-[var(--theme-gold)] hover:text-[var(--theme-gold)]',
                                            (readOnly || restricted) && 'opacity-40 cursor-not-allowed',
                                        )}
                                    >
                                        {entry.icon}
                                        {BLOCK_LABELS[entry.type]}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
                        <h4 className="mb-2 text-xs uppercase tracking-wide text-[var(--theme-text-muted)]">Estrutura</h4>
                        {blocks.length === 0 ? (
                            <p className="text-[11px] text-[var(--theme-text-muted)]">O informativo está vazio.</p>
                        ) : (
                            <ul className="flex flex-col gap-1">
                                {blocks.map((block, index) => (
                                    <li key={block.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(block.id)}
                                            className={cn(
                                                'w-full truncate rounded px-2 py-1 text-left text-[11px]',
                                                block.id === selectedId
                                                    ? 'bg-[var(--theme-surface)] text-[var(--theme-gold)]'
                                                    : 'text-[var(--theme-text-muted)] hover:text-[var(--theme-text-main)]',
                                            )}
                                        >
                                            {index + 1}. {BLOCK_LABELS[block.type]}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <Button size="sm" icon={<Code2 className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setHtmlMode((value) => !value)}>
                        {htmlMode ? 'Voltar ao editor visual' : 'Editar código HTML'}
                    </Button>

                    <Button size="sm" onClick={() => setDesignOpen(true)} disabled={readOnly}>
                        Estilos do informativo
                    </Button>
                </aside>

                {/* Canvas ------------------------------------------------------- */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant={device === 'desktop' ? 'primary' : 'secondary'} onClick={() => setDevice('desktop')}>
                                Desktop
                            </Button>
                            <Button size="sm" variant={device === 'mobile' ? 'primary' : 'secondary'} onClick={() => setDevice('mobile')}>
                                Mobile
                            </Button>
                        </div>
                        <Badge tone="neutral">{blocks.length} bloco(s)</Badge>
                    </div>

                    {htmlMode ? (
                        <div className="flex flex-col gap-2">
                            <Field label="HTML completo do informativo" hint="Edição direta do documento final. O modo visual continua sendo a fonte dos blocos.">
                                {(id) => (
                                    <Textarea
                                        id={id}
                                        value={htmlDraft}
                                        readOnly
                                        className="min-h-[420px] font-mono text-xs"
                                        aria-describedby="html-note"
                                    />
                                )}
                            </Field>
                            <p id="html-note" className="text-[11px] text-[var(--theme-text-muted)]">
                                O HTML é gerado a partir dos blocos. Para alterar o conteúdo, edite os blocos no modo visual — assim o
                                mesmo conteúdo continua disponível para a versão em texto puro e para a personalização por variáveis.
                            </p>
                            <Button
                                size="sm"
                                onClick={() => {
                                    void navigator.clipboard.writeText(htmlDraft);
                                }}
                            >
                                Copiar HTML
                            </Button>
                        </div>
                    ) : (
                        <div
                            ref={canvasRef}
                            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3"
                        >
                            {readOnly ? null : (
                                <p className="mb-2 text-[11px] text-[var(--theme-text-muted)]">
                                    Arraste pelo ícone para reordenar. Teclado: use os botões de subir/descer em cada bloco.
                                </p>
                            )}

                            {blocks.length === 0 ? (
                                <p className="py-10 text-center text-sm text-[var(--theme-text-muted)]">
                                    Adicione um bloco na paleta à esquerda para começar.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-2">
                                    {blocks.map((block, index) => (
                                        <li
                                            key={block.id}
                                            data-block-id={block.id}
                                            draggable={!readOnly}
                                            onDragStart={() => setDragIndex(index)}
                                            onDragOver={(event) => {
                                                event.preventDefault();
                                                setOverIndex(index);
                                            }}
                                            onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
                                            onDrop={() => onDrop(index)}
                                            onDragEnd={() => {
                                                setDragIndex(null);
                                                setOverIndex(null);
                                            }}
                                            className={cn(
                                                'rounded-lg border p-3 transition-colors',
                                                block.id === selectedId
                                                    ? 'border-[var(--theme-gold)]'
                                                    : 'border-[var(--theme-border)]',
                                                overIndex === index && dragIndex !== null && 'border-dashed border-[var(--theme-gold)] bg-[var(--theme-surface)]',
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    {readOnly ? null : (
                                                        <span
                                                            className="cursor-grab text-[var(--theme-text-muted)]"
                                                            aria-hidden="true"
                                                            title="Arrastar para reordenar"
                                                        >
                                                            <GripVertical className="h-4 w-4" />
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-[var(--theme-text-muted)]">
                                                        {index + 1}. {BLOCK_LABELS[block.type]}
                                                    </span>
                                                </div>

                                                {readOnly ? null : (
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => move(block.id, -1)}
                                                            disabled={index === 0}
                                                            aria-label={`Mover ${BLOCK_LABELS[block.type]} para cima`}
                                                            icon={<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => move(block.id, 1)}
                                                            disabled={index === blocks.length - 1}
                                                            aria-label={`Mover ${BLOCK_LABELS[block.type]} para baixo`}
                                                            icon={<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => duplicateBlock(block.id)}
                                                            aria-label={`Duplicar ${BLOCK_LABELS[block.type]}`}
                                                            icon={<Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => removeBlock(block.id)}
                                                            aria-label={`Remover ${BLOCK_LABELS[block.type]}`}
                                                            icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setSelectedId(block.id)}
                                                className="mt-2 block w-full text-left text-[11px] text-[var(--theme-text-muted)] underline decoration-dotted"
                                            >
                                                {blockPreviewLabel(block)}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* Preview ----------------------------------------------------- */}
                    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
                        <h4 className="mb-2 text-xs uppercase tracking-wide text-[var(--theme-text-muted)]">
                            Pré-visualização ({device === 'desktop' ? 'desktop' : 'mobile'})
                        </h4>
                        <div className={cn('mx-auto transition-all', device === 'mobile' ? 'w-[375px] max-w-full' : 'w-full')}>
                            <iframe
                                title={`Pré-visualização do informativo em ${device}`}
                                srcDoc={previewHtml}
                                sandbox=""
                                className="h-[520px] w-full rounded-lg border border-[var(--theme-border)] bg-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Block inspector ---------------------------------------------- */}
            {selected && !htmlMode ? (
                <BlockInspector
                    block={selected}
                    canUseRawHtml={canUseRawHtml}
                    readOnly={readOnly}
                    onChange={patchSelected}
                />
            ) : null}

            {/* Design dialog ------------------------------------------------- */}
            <Modal
                open={designOpen}
                onClose={() => setDesignOpen(false)}
                title="Estilos do informativo"
                description="Aplicados a todos os blocos que não definem cor própria."
                footer={
                    <Button variant="primary" onClick={() => setDesignOpen(false)}>
                        Concluir
                    </Button>
                }
            >
                <div className="grid gap-3 sm:grid-cols-2">
                    {(
                        [
                            ['backgroundColor', 'Fundo externo'],
                            ['contentBackgroundColor', 'Fundo do conteúdo'],
                            ['textColor', 'Cor do texto'],
                            ['linkColor', 'Cor dos links'],
                            ['buttonBgColor', 'Fundo dos botões'],
                            ['buttonTextColor', 'Texto dos botões'],
                        ] as const
                    ).map(([key, label]) => (
                        <Field key={key} label={label}>
                            {(id) => (
                                <div className="flex items-center gap-2">
                                    <input
                                        id={id}
                                        type="color"
                                        value={design[key] ?? DEFAULT_DESIGN[key]}
                                        onChange={(event) => onDesignChange({ ...design, [key]: event.target.value })}
                                        className="h-9 w-12 cursor-pointer rounded border border-[var(--theme-border)] bg-transparent"
                                    />
                                    <Input
                                        value={design[key] ?? DEFAULT_DESIGN[key]}
                                        onChange={(event) => onDesignChange({ ...design, [key]: event.target.value })}
                                        aria-label={`${label} em hexadecimal`}
                                    />
                                </div>
                            )}
                        </Field>
                    ))}

                    <Field label="Largura do conteúdo (px)">
                        {(id) => (
                            <Input
                                id={id}
                                type="number"
                                min={480}
                                max={800}
                                value={design.contentWidth ?? DEFAULT_DESIGN.contentWidth}
                                onChange={(event) => onDesignChange({ ...design, contentWidth: Number(event.target.value) })}
                            />
                        )}
                    </Field>

                    <Field label="Arredondamento das bordas (px)">
                        {(id) => (
                            <Input
                                id={id}
                                type="number"
                                min={0}
                                max={32}
                                value={design.borderRadius ?? DEFAULT_DESIGN.borderRadius}
                                onChange={(event) => onDesignChange({ ...design, borderRadius: Number(event.target.value) })}
                            />
                        )}
                    </Field>
                </div>
            </Modal>
        </div>
    );
};

function blockPreviewLabel(block: NewsletterBlock): string {
    switch (block.type) {
        case 'heading':
            return block.text || '(título vazio)';
        case 'text':
            return block.html.replace(/<[^>]+>/g, ' ').slice(0, 90) || '(texto vazio)';
        case 'button':
            return `${block.label} → ${block.href}`;
        case 'image':
            return block.src;
        case 'video':
            return block.url;
        case 'html':
            return block.html.replace(/<[^>]+>/g, ' ').slice(0, 90);
        case 'columns':
            return `${block.columns.length} coluna(s)`;
        case 'divider':
            return `linha de ${block.thickness ?? 1}px`;
        case 'spacer':
            return `${block.height ?? 24}px de respiro`;
        default:
            return '';
    }
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

const BlockInspector: React.FC<{
    block: NewsletterBlock;
    readOnly: boolean;
    canUseRawHtml: boolean;
    onChange: (patch: Record<string, unknown>) => void;
}> = ({ block, readOnly, canUseRawHtml, onChange }) => {
    const alignmentSelect = (value: Alignment, key = 'align') => (
        <Select
            value={value}
            aria-label="Alinhamento"
            disabled={readOnly}
            onChange={(event) => onChange({ [key]: event.target.value })}
        >
            <option value="left">Esquerda</option>
            <option value="center">Centro</option>
            <option value="right">Direita</option>
        </Select>
    );

    return (
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
            <h4 className="mb-3 text-sm text-[var(--theme-text-main)]">
                Propriedades do bloco: {BLOCK_LABELS[block.type]}
            </h4>

            <div className="grid gap-3 md:grid-cols-2">
                {block.type === 'heading' ? (
                    <>
                        <Field label="Título">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.text}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ text: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Nível">
                            {(id) => (
                                <Select
                                    id={id}
                                    value={String(block.level)}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ level: Number(event.target.value) })}
                                >
                                    <option value="1">Título principal (h1)</option>
                                    <option value="2">Seção (h2)</option>
                                    <option value="3">Subseção (h3)</option>
                                </Select>
                            )}
                        </Field>
                        <Field label="Alinhamento">{(id) => <span id={id}>{alignmentSelect(block.align)}</span>}</Field>
                    </>
                ) : null}

                {block.type === 'text' ? (
                    <>
                        <div className="md:col-span-2">
                            <Field label="Conteúdo HTML">
                                {(id) => (
                                    <Textarea
                                        id={id}
                                        value={block.html}
                                        disabled={readOnly}
                                        onChange={(event) => onChange({ html: event.target.value })}
                                        className="min-h-[140px] font-mono text-xs"
                                    />
                                )}
                            </Field>
                        </div>
                        <Field label="Alinhamento">{(id) => <span id={id}>{alignmentSelect(block.align)}</span>}</Field>
                        <Field label="Tamanho da fonte (px)">
                            {(id) => (
                                <Input
                                    id={id}
                                    type="number"
                                    min={12}
                                    max={32}
                                    value={block.fontSize ?? 16}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
                                />
                            )}
                        </Field>
                    </>
                ) : null}

                {block.type === 'image' ? (
                    <>
                        <Field label="URL da imagem" required>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.src}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ src: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Texto alternativo" hint="Importante para acessibilidade e para clientes que bloqueiam imagens.">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.alt ?? ''}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ alt: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Link ao clicar">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.href ?? ''}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ href: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Largura (px)">
                            {(id) => (
                                <Input
                                    id={id}
                                    type="number"
                                    min={100}
                                    max={800}
                                    value={block.width ?? 600}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ width: Number(event.target.value) })}
                                />
                            )}
                        </Field>
                        <Field label="Alinhamento">{(id) => <span id={id}>{alignmentSelect(block.align)}</span>}</Field>
                    </>
                ) : null}

                {block.type === 'button' ? (
                    <>
                        <Field label="Texto do botão" required>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.label}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ label: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="URL de destino" required>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.href}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ href: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Alinhamento">{(id) => <span id={id}>{alignmentSelect(block.align)}</span>}</Field>
                        <Field label="Fundo">
                            {(id) => (
                                <input
                                    id={id}
                                    type="color"
                                    value={block.bgColor ?? '#581825'}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ bgColor: event.target.value })}
                                    className="h-9 w-16 cursor-pointer rounded border border-[var(--theme-border)] bg-transparent"
                                />
                            )}
                        </Field>
                    </>
                ) : null}

                {block.type === 'divider' ? (
                    <>
                        <Field label="Cor">
                            {(id) => (
                                <input
                                    id={id}
                                    type="color"
                                    value={block.color ?? '#e5e7eb'}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ color: event.target.value })}
                                    className="h-9 w-16 cursor-pointer rounded border border-[var(--theme-border)] bg-transparent"
                                />
                            )}
                        </Field>
                        <Field label="Espessura (px)">
                            {(id) => (
                                <Input
                                    id={id}
                                    type="number"
                                    min={1}
                                    max={8}
                                    value={block.thickness ?? 1}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ thickness: Number(event.target.value) })}
                                />
                            )}
                        </Field>
                    </>
                ) : null}

                {block.type === 'spacer' ? (
                    <Field label="Altura (px)">
                        {(id) => (
                            <Input
                                id={id}
                                type="number"
                                min={4}
                                max={120}
                                value={block.height ?? 24}
                                disabled={readOnly}
                                onChange={(event) => onChange({ height: Number(event.target.value) })}
                            />
                        )}
                    </Field>
                ) : null}

                {block.type === 'video' ? (
                    <>
                        <Field label="URL do vídeo" required>
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.url}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ url: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Imagem de capa" hint="Sem capa, o bloco renderiza um botão de play.">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.thumbnail ?? ''}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ thumbnail: event.target.value })}
                                />
                            )}
                        </Field>
                        <Field label="Título exibido">
                            {(id) => (
                                <Input
                                    id={id}
                                    value={block.title ?? ''}
                                    disabled={readOnly}
                                    onChange={(event) => onChange({ title: event.target.value })}
                                />
                            )}
                        </Field>
                    </>
                ) : null}

                {block.type === 'html' ? (
                    <div className="md:col-span-2">
                        <Field
                            label="HTML personalizado"
                            hint="Tags de script, iframe e manipuladores de evento são removidos no envio."
                            error={!canUseRawHtml ? 'Disponível apenas para perfis de edição.' : undefined}
                        >
                            {(id) => (
                                <Textarea
                                    id={id}
                                    value={block.html}
                                    disabled={readOnly || !canUseRawHtml}
                                    onChange={(event) => onChange({ html: event.target.value })}
                                    className="min-h-[160px] font-mono text-xs"
                                />
                            )}
                        </Field>
                    </div>
                ) : null}

                {block.type === 'columns' ? (
                    <div className="md:col-span-2 flex flex-col gap-3">
                        <p className="text-xs text-[var(--theme-text-muted)]">
                            Cada coluna contém os blocos de texto do próprio ramo. Edite o conteúdo no bloco de texto interno.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                disabled={readOnly}
                                icon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                                onClick={() =>
                                    onChange({
                                        columns: [...block.columns, { blocks: [createBlock('text')] }],
                                    })
                                }
                            >
                                Adicionar coluna
                            </Button>
                            <Button
                                size="sm"
                                disabled={readOnly || block.columns.length <= 1}
                                onClick={() => onChange({ columns: block.columns.slice(0, -1) })}
                            >
                                Remover última
                            </Button>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="mt-3">
                <Toggle
                    checked={Boolean(block.type === 'html')}
                    onChange={() => undefined}
                    disabled
                    label="Bloco avançado"
                    hint="Blocos de HTML só devem ser usados quando o layout padrão não atende."
                />
            </div>
        </div>
    );
};

export default NewsletterEditor;
