/**
 * Verification script for lazily-resolved environment configuration.
 *
 * Confirms the three properties the runtime env accessors must satisfy:
 *   1. Values are resolved from `process.env` at access time and are never
 *      embedded as literals in source (SonarQube typescript:S2068).
 *   2. A missing variable fails fast with an explicit, actionable error instead
 *      of silently falling back to a placeholder value.
 *   3. Resolution is lazy and memoised: the environment is read once, on the
 *      first successful access, and the resolved value is reused afterwards.
 *
 * Top-level `await` is used throughout without promise chains (SonarQube typescript:S7785).
 */

import { randomUUID } from 'node:crypto';

/** Marker substituted for a sensitive value whenever it is echoed to the console. */
const REDACTED_MARKER = '<redacted>';

/** Probe names used only by this script; they intentionally exist nowhere else. */
const UNSET_PROBE_NAME = 'LAZY_ENV_VERIFY_UNSET_PROBE';
const SENTINEL_NAME = 'LAZY_ENV_VERIFY_SENTINEL';

/** Reads a required environment variable, throwing when it is absent or blank. */
export function requireEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
        throw new Error(
            `Missing required environment variable "${name}". ` +
            'Export it (or add it to .env) before running this script; ' +
            'no fallback value is provided.',
        );
    }
    return value;
}

/** Describes a sensitive value for log output without revealing it. */
export function maskSensitiveValue(value: string): string {
    return value.length === 0 ? REDACTED_MARKER : `${REDACTED_MARKER} (length ${value.length})`;
}

/** Asynchronous env read; models a config lookup whose result must be awaited. */
async function resolveEnvValue(name: string): Promise<string> {
    return await Promise.resolve(requireEnv(name));
}

export interface LazyEnvReader {
    readonly name: string;
    readonly resolved: boolean;
    read(): Promise<string>;
}

export function createLazyEnvReader(name: string): LazyEnvReader {
    let cached: string | undefined;
    return {
        name,
        get resolved(): boolean {
            return cached !== undefined;
        },
        async read(): Promise<string> {
            let value = cached;
            if (value === undefined) {
                value = await resolveEnvValue(name);
                cached = value;
                console.log(`[lazy-env] Resolved "${name}" -> ${maskSensitiveValue(value)}`);
            }
            return value;
        },
    };
}

console.log('--- Verificando resolucao preguicosa de variaveis de ambiente ---');

// Check 1: an unset variable must raise a clear error, never a fallback value.
delete process.env[UNSET_PROBE_NAME];
const unsetReader = createLazyEnvReader(UNSET_PROBE_NAME);
let failFastMessage = '';
try {
    await unsetReader.read();
} catch (error) {
    failFastMessage = error instanceof Error ? error.message : String(error);
}

// Check 2: constructing a reader must not touch the environment (true laziness).
// The sentinel is generated at runtime, so no value literal exists in source.
process.env[SENTINEL_NAME] = randomUUID();
const sentinelReader = createLazyEnvReader(SENTINEL_NAME);
const resolvedBeforeFirstRead = sentinelReader.resolved;

// Check 3: resolve via an awaited read, then mutate the environment to prove the
// first resolved value was memoised rather than re-read on every access.
const firstRead = await sentinelReader.read();
process.env[SENTINEL_NAME] = randomUUID();
const secondRead = await sentinelReader.read();
const memoisedAcrossMutation = firstRead === secondRead;

// Check 4: the masked rendering must not leak the underlying value.
const masked = maskSensitiveValue(firstRead);
const redactionHidesValue = !masked.includes(firstRead);

delete process.env[SENTINEL_NAME];

const checks = [
    {
        label: 'fail-fast ao ler variavel nao definida',
        passed: failFastMessage.includes(UNSET_PROBE_NAME),
        detail: failFastMessage === '' ? 'nenhum erro lancado' : failFastMessage,
    },
    {
        label: 'nao resolve antes do primeiro acesso (lazy)',
        passed: resolvedBeforeFirstRead === false,
        detail: `resolved antes do primeiro read = ${resolvedBeforeFirstRead}`,
    },
    {
        label: 'memoiza o primeiro valor resolvido',
        passed: memoisedAcrossMutation,
        detail: `primeiro valor reutilizado apos mutacao = ${memoisedAcrossMutation}`,
    },
    {
        label: 'mascara nao revela o valor',
        passed: redactionHidesValue,
        detail: `saida mascarada = ${masked}`,
    },
];

console.log('--- Resumo ---');
for (const check of checks) {
    console.log(`${check.passed ? 'PASS' : 'FAIL'} - ${check.label}: ${check.detail}`);
}

const failedChecks = checks.filter((check) => !check.passed);
if (failedChecks.length > 0) {
    console.error(`${failedChecks.length} verificacao(oes) de lazy env falharam.`);
    process.exitCode = 1;
} else {
    console.log('Todas as verificacoes de lazy env passaram.');
}
