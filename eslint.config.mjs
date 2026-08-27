import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

export default defineConfig([
    ...nextVitals,
    ...nextTypescript,
    {
        rules: {
            // React 19 exposes useful migration findings across the legacy UI. Keep
            // them visible without making unrelated Fable-facing screens block CI.
            'react-hooks/set-state-in-effect': 'warn',
            'react-hooks/refs': 'warn',
            'react-hooks/purity': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-require-imports': 'warn',
            '@typescript-eslint/ban-ts-comment': 'warn',
            'prefer-const': 'warn',
        },
    },
    globalIgnores([
        '.next/**',
        'public/sw.js',
        'public/workbox-*.js',
        'node_modules/**',
        'train-tracks/**',
        '.tmp-*/**',
    ]),
]);
