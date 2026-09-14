import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
    { ignores: ['dist/', 'test-results/', 'playwright-report/'] },
    js.configs.recommended,
    {
        files: ['**/*.{js,jsx,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser }
        },
        plugins: { react, 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // Core no-unused-vars cannot see JSX usage on its own.
            'react/jsx-uses-vars': 'error',
            'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },
    {
        files: ['tests/**', '*.config.js', '*.config.mjs'],
        languageOptions: { globals: { ...globals.node } }
    }
];
