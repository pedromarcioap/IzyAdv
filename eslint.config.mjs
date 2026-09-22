import globals from "globals";

export default [
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.webextensions, // Reconhece chrome.runtime, chrome.storage, etc.
                APP_CONFIG: "writable"   // Declara variáveis globais personalizadas se houver
            }
        },
        rules: {
            // Regras contra redundância e condições estáticas
            "no-self-compare": "error",          // Impede comparar x === x
            "no-constant-condition": "warn",     // Avisa sobre if (true) ou checagens redundantes
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Alerta variáveis esquecidas
            "no-unreachable": "error",           // Código morto após return/break
            "no-duplicate-imports": "error",     // Imports repetidos
            "eqeqeq": ["error", "always"]        // Exige uso estrito de === e !==
        }
    }
];