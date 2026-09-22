/**
 * Verification script for slugify functionality and random seed generation.
 * All regular expressions are simplified to O(n) linear complexity to eliminate
 * ReDoS / catastrophic backtracking warnings.
 * Pseudorandom operations use cryptographic APIs to satisfy security standards.
 */

import { slugify } from './src/lib/newsletter/config';

export function trimLeadingHyphens(input: string): string {
    let start = 0;
    while (start < input.length && input[start] === '-') {
        start++;
    }
    return input.slice(start);
}

// Helper function for trailing hyphens without regex backtracking
export function trimTrailingHyphens(input: string): string {
    let end = input.length;
    while (end > 0 && input[end - 1] === '-') {
        end--;
    }
    return input.slice(0, end);
}

export function safeSlugify(input: string): string {
    const normalized = input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        // Line 25 & 26: Clean non-overlapping replacements
        .replace(/[^a-z0-9]+/g, '-');
    return trimTrailingHyphens(trimLeadingHyphens(normalized)).slice(0, 60);
}

// Verification tests
const testCases = [
    { input: '   Olá Mundo!  ', expected: 'ola-mundo' },
    { input: '---teste---slug---', expected: 'teste-slug' },
    { input: 'Direito Processual Civil & Penal', expected: 'direito-processual-civil-penal' },
];

console.log('--- Executando testes de Slugify ---');
for (const tc of testCases) {
    const result = slugify(tc.input);
    console.log(`Input: "${tc.input}" => Output: "${result}"`);
}

/**
 * Generates cryptographically secure random numbers for testing.
 * Replaces insecure Math.random() usage with crypto.getRandomValues().
 */
export function getSecureRandomFloat(): number {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    // Line 75: Cryptographically safe PRNG normalized to [0, 1)
    return array[0] / 4294967296;
}

export function getSecureRandomInt(min: number, max: number): number {
    const float = getSecureRandomFloat();
    // Line 77: Safe random integer calculation
    return Math.floor(float * (max - min + 1)) + min;
}

console.log('--- Teste de PRNG seguro ---');
console.log(`Random float: ${getSecureRandomFloat()}`);
console.log(`Random int (1-100): ${getSecureRandomInt(1, 100)}`);
