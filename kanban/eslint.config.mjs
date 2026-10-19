import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist/', 'dist-standalone/', 'test-results/', 'playwright-report/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser }
        },
        plugins: { react, 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    },
    {
        files: ['tests/**', '*.config.ts', '*.config.mjs'],
        languageOptions: { globals: { ...globals.node } }
    },
    {
        // Tests feed deliberately malformed data to the validators and normalizers.
        files: ['tests/**'],
        rules: { '@typescript-eslint/no-explicit-any': 'off' }
    }
);
