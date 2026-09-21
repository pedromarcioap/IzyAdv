/**
 * Authentication unit tests — no browser, no network, no test framework.
 *
 *   npm run test:auth
 *
 * Only pure modules are exercised here (plus `decodeJwtPayloadForDisplay`, which
 * is pure given a token string). Everything that needs Supabase is covered by
 * supabase/tests/auth_verification.sql at the database level, because a mocked
 * client would prove nothing about the RLS policies that actually protect data.
 */

import assert from 'node:assert/strict';
import { classifyAuthError, describeAuthError, isSessionInvalidError, AuthError } from '../../src/lib/auth/errors';
import {
    normalizeEmail,
    isValidEmail,
    validateLoginForm,
    hasErrors,
    assessPasswordStrength,
    MIN_PASSWORD_LENGTH,
} from '../../src/lib/auth/validation';
import {
    buildLoginRedirect,
    isSafeInternalPath,
    readRedirectParam,
    resolvePostLoginTarget,
    resolvePostLogoutTarget,
    toHashRoute,
} from '../../src/lib/auth/redirects';
import { buildHash, matchesRoute, normalizePath, parseHash, toHashTarget } from '../../src/lib/router/hashRouter';
import { APP_ROUTES } from '../../src/lib/router/routes';
import {
    atLeast,
    fromLegacyRole,
    hasAnyRole,
    roleLabel,
    toLegacyAdminUser,
    toLegacyRole,
} from '../../src/lib/auth/roles';
import { describeExpiry, describeUserAgent, formatSessionMoment } from '../../src/lib/auth/devices';
import { decodeJwtPayloadForDisplay } from '../../src/lib/auth/service';

type TestFn = () => void | Promise<void>;

const tests: { name: string; fn: TestFn }[] = [];

function test(name: string, fn: TestFn): void {
    tests.push({ name, fn });
}

function section(name: string): void {
    console.log(`\n${name}`);
}

function base64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fakeJwt(payload: Record<string, unknown>): string {
    return `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(JSON.stringify(payload))}.signature`;
}

// ---------------------------------------------------------------------------
// Credential validation
// ---------------------------------------------------------------------------

section('validation');

test('normalizeEmail trims and lowercases', () => {
    assert.equal(normalizeEmail('  Socio@Firma.Adv.BR '), 'socio@firma.adv.br');
});

test('isValidEmail accepts institutional addresses and rejects malformed ones', () => {
    assert.equal(isValidEmail('admin@veritaslex.adv.br'), true);
    assert.equal(isValidEmail('admin@veritaslex'), false);
    assert.equal(isValidEmail('admin veritaslex.adv.br'), false);
    assert.equal(isValidEmail(''), false);
});

test('validateLoginForm requires both fields', () => {
    const errors = validateLoginForm({ email: '', password: '' });
    assert.ok(errors.email, 'empty e-mail must be reported');
    assert.ok(errors.password, 'empty password must be reported');
    assert.equal(hasErrors(errors), true);
});

test('validateLoginForm reports a malformed e-mail', () => {
    const errors = validateLoginForm({ email: 'nao-e-email', password: 'x' });
    assert.match(errors.email ?? '', /formato inválido/i);
    assert.equal(errors.password, undefined);
});

test('sign-in never enforces the password strength policy', () => {
    // A short legacy password must still be submittable: the policy applies when
    // a password is chosen, not when an existing one is presented.
    const errors = validateLoginForm({ email: 'admin@veritaslex.adv.br', password: 'a' });
    assert.equal(hasErrors(errors), false);
});

test('assessPasswordStrength flags each unmet requirement', () => {
    const weak = assessPasswordStrength('curta');
    assert.equal(weak.valid, false);
    assert.ok(weak.problems.some((problem) => problem.includes(String(MIN_PASSWORD_LENGTH))));
    assert.ok(weak.problems.some((problem) => /maiúscula/.test(problem)));
    assert.ok(weak.problems.some((problem) => /número/.test(problem)));
    assert.ok(weak.problems.some((problem) => /símbolo/.test(problem)));
});

test('assessPasswordStrength accepts a compliant password', () => {
    const strong = assessPasswordStrength('Veritas@2026Seguro');
    assert.equal(strong.valid, true);
    assert.deepEqual(strong.problems, []);
    assert.equal(strong.score, 4);
});

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

section('errors');

test('wrong e-mail and wrong password produce the same message (no enumeration oracle)', () => {
    const wrongEmail = classifyAuthError({ message: 'Invalid login credentials', status: 400 });
    const wrongPassword = classifyAuthError({ message: 'invalid login credentials', status: 400 });
    assert.equal(wrongEmail.code, 'invalid_credentials');
    assert.equal(wrongEmail.message, wrongPassword.message);
    assert.match(wrongEmail.message, /e-mail ou senha incorretos/i);
});

test('rate limiting is classified as retriable', () => {
    const error = classifyAuthError({ message: 'Request rate limit reached', status: 429 });
    assert.equal(error.code, 'rate_limited');
    assert.equal(error.retriable, true);
});

test('network failures and 5xx are retriable', () => {
    assert.equal(classifyAuthError({ message: 'Failed to fetch' }).retriable, true);
    assert.equal(classifyAuthError({ message: 'TypeError: Load failed' }).code, 'network');
    assert.equal(classifyAuthError({ message: 'Internal error', status: 500 }).code, 'service_unavailable');
});

test('banned/disabled accounts are reported as disabled', () => {
    assert.equal(classifyAuthError({ message: 'User is banned' }).code, 'account_disabled');
});

test('revoked or expired sessions are detected across Supabase error shapes', () => {
    assert.equal(isSessionInvalidError({ status: 401, message: 'Unauthorized' }), true);
    assert.equal(isSessionInvalidError({ message: 'Auth session missing!' }), true);
    assert.equal(isSessionInvalidError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }), true);
    assert.equal(isSessionInvalidError({ message: 'Invalid login credentials' }), false);
    assert.equal(isSessionInvalidError(null), false);
});

test('describeAuthError handles AuthError, Error and unknown values', () => {
    assert.equal(describeAuthError(new AuthError('network', 'sem rede')), 'sem rede');
    assert.match(describeAuthError(new Error('Invalid login credentials')), /e-mail ou senha incorretos/i);
    assert.match(describeAuthError(undefined), /não foi possível/i);
});

// ---------------------------------------------------------------------------
// Redirect safety
// ---------------------------------------------------------------------------

section('redirects');

test('isSafeInternalPath accepts internal routes', () => {
    assert.equal(isSafeInternalPath('#/admin'), true);
    assert.equal(isSafeInternalPath('/admin/newsletter'), true);
    assert.equal(isSafeInternalPath('#/admin?tab=users'), true);
    assert.equal(isSafeInternalPath(APP_ROUTES.login), true);
});

test('isSafeInternalPath rejects everything that could leave the origin', () => {
    assert.equal(isSafeInternalPath('https://evil.example/steal'), false);
    assert.equal(isSafeInternalPath('//evil.example'), false);
    assert.equal(isSafeInternalPath('/\\evil.example'), false);
    assert.equal(isSafeInternalPath('javascript:alert(1)'), false);
    assert.equal(isSafeInternalPath(''), false);
    assert.equal(isSafeInternalPath(undefined), false);
});

test('toHashRoute normalizes both accepted shapes', () => {
    assert.equal(toHashRoute('/admin'), '#/admin');
    assert.equal(toHashRoute('#/admin'), '#/admin');
});

test('resolvePostLoginTarget restores the requested destination', () => {
    assert.equal(resolvePostLoginTarget('#/admin/newsletter'), '#/admin/newsletter');
    assert.equal(resolvePostLoginTarget('/admin/newsletter'), '#/admin/newsletter');
});

test('resolvePostLoginTarget refuses external targets and login loops', () => {
    const fallback = toHashRoute(APP_ROUTES.admin);
    assert.equal(resolvePostLoginTarget('https://evil.example'), fallback);
    assert.equal(resolvePostLoginTarget('//evil.example'), fallback);
    assert.equal(resolvePostLoginTarget('#/login'), fallback);
    assert.equal(resolvePostLoginTarget(undefined), fallback);
});

test('buildLoginRedirect encodes the requested path', () => {
    const login = buildLoginRedirect('#/admin/newsletter');
    assert.equal(login, `#/login?redirect=${encodeURIComponent('#/admin/newsletter')}`);
    assert.equal(readRedirectParam(login.split('?')[1]), '#/admin/newsletter');
});

test('buildLoginRedirect does not nest a login redirect inside itself', () => {
    assert.equal(buildLoginRedirect('#/login?redirect=%23%2Fadmin'), toHashRoute(APP_ROUTES.login));
});

test('readRedirectParam tolerates missing or empty values', () => {
    assert.equal(readRedirectParam(''), null);
    assert.equal(readRedirectParam('redirect='), null);
    assert.equal(readRedirectParam(new URLSearchParams('redirect=%23%2Fadmin')), '#/admin');
});

test('resolvePostLogoutTarget returns the public home route', () => {
    assert.equal(resolvePostLogoutTarget(), toHashRoute(APP_ROUTES.home));
});

// ---------------------------------------------------------------------------
// Hash router
// ---------------------------------------------------------------------------

section('hash router');

test('normalizePath collapses slashes and resolves traversal', () => {
    assert.equal(normalizePath('/admin//users'), '/admin/users');
    assert.equal(normalizePath('/admin/./newsletter'), '/admin/newsletter');
    assert.equal(normalizePath('/admin/../').toString(), '/');
    assert.equal(normalizePath(''), '/');
});

test('parseHash splits path from query', () => {
    const route = parseHash('#/admin/newsletter?tab=settings');
    assert.equal(route.path, '/admin/newsletter');
    assert.equal(route.query.get('tab'), 'settings');
});

test('parseHash normalizes an empty hash to the home route', () => {
    assert.equal(parseHash('').path, '/');
    assert.equal(parseHash('#').path, '/');
});

test('toHashTarget and buildHash round-trip through parseHash', () => {
    assert.equal(toHashTarget('/admin'), '#/admin');
    assert.equal(toHashTarget('admin/'), '#/admin');
    const built = buildHash('/admin/newsletter', { tab: 'subscribers' });
    const parsed = parseHash(built);
    assert.equal(parsed.path, '/admin/newsletter');
    assert.equal(parsed.query.get('tab'), 'subscribers');
});

test('matchesRoute ignores trailing slashes', () => {
    assert.equal(matchesRoute('/admin/', APP_ROUTES.admin), true);
    assert.equal(matchesRoute('/admin/newsletter', APP_ROUTES.admin), false);
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

section('roles');

test('role hierarchy is ordered master > admin > editor > analyst > viewer', () => {
    assert.equal(atLeast('master_admin', 'admin'), true);
    assert.equal(atLeast('admin', 'admin'), true);
    assert.equal(atLeast('editor', 'admin'), false);
    assert.equal(atLeast('viewer', 'analyst'), false);
    assert.equal(atLeast(null, 'viewer'), false);
});

test('hasAnyRole is exact membership, not a hierarchy', () => {
    assert.equal(hasAnyRole('master_admin', ['master_admin']), true);
    assert.equal(hasAnyRole('admin', ['master_admin']), false);
    assert.equal(hasAnyRole(null, ['master_admin']), false);
});

test('legacy role projection covers enum values and round-trips', () => {
    assert.equal(toLegacyRole('master_admin'), 'Master Admin');
    assert.equal(toLegacyRole('admin'), 'Sócio Titular');
    assert.equal(toLegacyRole('editor'), 'Advogado Associado');
    assert.equal(toLegacyRole('analyst'), 'Advogado Associado');
    assert.equal(fromLegacyRole(toLegacyRole('admin')), 'admin');
    assert.equal(fromLegacyRole('Advogado Associado'), 'editor');
});

test('roleLabel never renders an empty badge', () => {
    assert.equal(roleLabel('analyst'), 'Analista');
    assert.equal(roleLabel(null), 'Sem perfil');
});

test('toLegacyAdminUser maps identity fields for the existing UI', () => {
    const identity = {
        userId: '11111111-1111-1111-1111-111111111111',
        email: 'admin@veritaslex.adv.br',
        role: 'master_admin' as const,
        fullName: 'Dr. Pedro Márcio',
        sessionId: '22222222-2222-2222-2222-222222222222',
        expiresAt: 1_800_000_000,
        profile: {
            user_id: '11111111-1111-1111-1111-111111111111',
            email: 'admin@veritaslex.adv.br',
            full_name: 'Dr. Pedro Márcio',
            role: 'master_admin' as const,
            is_active: true,
            permissions: {},
            phone: null,
            last_seen_at: '2026-09-21T12:00:00.000Z',
            invited_at: null,
            accepted_at: '2024-01-15T10:00:00.000Z',
            created_by: null,
            created_at: '2024-01-15T10:00:00.000Z',
            updated_at: '2026-09-21T12:00:00.000Z',
        },
    };

    const legacy = toLegacyAdminUser(identity);
    assert.equal(legacy.role, 'Master Admin');
    assert.equal(legacy.email, 'admin@veritaslex.adv.br');
    assert.ok(legacy.name);
    assert.ok(legacy.lastSignIn);
    assert.equal(legacy.password, undefined, 'no credential may exist in the UI model');
});

// ---------------------------------------------------------------------------
// Session presentation
// ---------------------------------------------------------------------------

section('devices');

test('describeUserAgent labels browser and platform', () => {
    const chrome = describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    );
    assert.match(chrome.label, /Chrome/);
    assert.match(chrome.label, /Windows/);

    const api = describeUserAgent('curl/8.4.0');
    assert.match(api.label, /Cliente de API/);

    assert.match(describeUserAgent(null).label, /não identificado/);
});

test('formatSessionMoment tolerates invalid input', () => {
    assert.equal(formatSessionMoment(null), '—');
    assert.equal(formatSessionMoment('not-a-date'), '—');
    assert.notEqual(formatSessionMoment('2026-09-21T12:00:00.000Z'), '—');
});

test('describeExpiry reports the remaining window instead of inventing one', () => {
    const now = new Date('2026-09-21T12:00:00.000Z');
    const inThirtyMinutes = Math.floor(now.getTime() / 1000) + 1800;
    assert.equal(describeExpiry(inThirtyMinutes, now), 'expira em 30 min');

    const inThreeHours = Math.floor(now.getTime() / 1000) + 3 * 3600;
    assert.equal(describeExpiry(inThreeHours, now), 'expira em 3 h');

    const past = Math.floor(now.getTime() / 1000) - 10;
    assert.equal(describeExpiry(past, now), 'Expirado');
    assert.equal(describeExpiry(null, now), null);
});

// ---------------------------------------------------------------------------
// Token decoding (display only)
// ---------------------------------------------------------------------------

section('jwt display decoding');

test('decodeJwtPayloadForDisplay reads session_id and exp', () => {
    const token = fakeJwt({ session_id: 'abc-123', exp: 1_800_000_000, sub: 'user-1' });
    const payload = decodeJwtPayloadForDisplay(token);
    assert.equal(payload?.session_id, 'abc-123');
    assert.equal(payload?.exp, 1_800_000_000);
});

test('decodeJwtPayloadForDisplay never throws on malformed input', () => {
    assert.equal(decodeJwtPayloadForDisplay('not-a-token'), null);
    assert.equal(decodeJwtPayloadForDisplay('a.b'), null);
    assert.equal(decodeJwtPayloadForDisplay(null), null);
    assert.equal(decodeJwtPayloadForDisplay(undefined), null);
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    let failed = 0;

    for (const current of tests) {
        try {
            await current.fn();
            console.log(`  ✓ ${current.name}`);
        } catch (error) {
            failed += 1;
            console.error(`  ✗ ${current.name}`);
            console.error(`      ${(error as Error).message.split('\n').join('\n      ')}`);
        }
    }

    const passed = tests.length - failed;
    console.log(`\n${passed}/${tests.length} verificações passaram.`);

    if (failed > 0) {
        console.error(`AUTH UNIT TESTS FAILED (${failed} falha(s))`);
        process.exitCode = 1;
        return;
    }

    console.log('AUTH UNIT TESTS PASSED');
}

void main();
