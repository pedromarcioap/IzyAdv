/**
 * Credential validation. Pure functions, no Supabase import, so the rules are
 * unit-testable without a browser or a network.
 *
 * Two different things are validated in an authentication system and mixing
 * them up locks people out:
 *
 *   * At sign-in: "is the field filled and well-formed?". Never the strength
 *     policy — an account created under an older policy must still be able to
 *     sign in.
 *   * When a password is chosen: the strength policy, mirrored by the Auth
 *     server (supabase/config.toml: minimum_password_length and
 *     password_requirements). The server is the authority; this is the UI.
 */

/** RFC-practical e-mail shape. Deliberately permissive; the Auth server is the authority. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Keep in sync with `minimum_password_length` in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 12;

export interface LoginCredentials {
    /** Raw value typed by the user; use `normalizeEmail` before sending it. */
    email: string;
    password: string;
}

export interface LoginFieldErrors {
    email?: string;
    password?: string;
}

export interface PasswordAssessment {
    valid: boolean;
    /** Ordered list of unmet requirements, ready to render as a checklist. */
    problems: string[];
    score: 0 | 1 | 2 | 3 | 4;
}

/**
 * Trims and lowercases. GoTrue matches e-mail addresses case-insensitively, and
 * `auth.users.email` is stored lowercase, so sending a normalized value avoids
 * mystery "invalid credentials" failures for users who type `Socio@Firma.br`.
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
    return EMAIL_PATTERN.test(normalizeEmail(email));
}

/**
 * Validation for the sign-in form only: presence and shape.
 * The password is checked for emptiness, never for length or composition.
 */
export function validateLoginForm(credentials: LoginCredentials): LoginFieldErrors {
    const errors: LoginFieldErrors = {};

    if (!normalizeEmail(credentials.email)) {
        errors.email = 'Informe o e-mail institucional cadastrado.';
    } else if (!isValidEmail(credentials.email)) {
        errors.email = 'E-mail em formato inválido. Exemplo: nome@dominio.adv.br';
    }

    if (!credentials.password) {
        errors.password = 'Informe a senha da sua conta.';
    }

    return errors;
}

export function hasErrors(errors: LoginFieldErrors): boolean {
    return Boolean(errors.email || errors.password);
}

/**
 * Mirrors the server-side password policy. Used when a password is *chosen*
 * (password reset / recovery flows), never at sign-in.
 */
export function assessPasswordStrength(password: string): PasswordAssessment {
    const problems: string[] = [];

    if (password.length < MIN_PASSWORD_LENGTH) {
        problems.push(`Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    }
    if (!/[a-z]/.test(password)) {
        problems.push('Inclua ao menos uma letra minúscula.');
    }
    if (!/[A-Z]/.test(password)) {
        problems.push('Inclua ao menos uma letra maiúscula.');
    }
    if (!/\d/.test(password)) {
        problems.push('Inclua ao menos um número.');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        problems.push('Inclua ao menos um símbolo (ex.: ! @ # $ %).');
    }
    if (/^\s|\s$/.test(password)) {
        problems.push('Não comece nem termine a senha com espaços.');
    }

    const satisfied = 6 - problems.length;
    const score = Math.max(0, Math.min(4, satisfied - 2)) as 0 | 1 | 2 | 3 | 4;

    return { valid: problems.length === 0, problems, score };
}
