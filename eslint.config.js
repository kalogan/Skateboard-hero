// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Architecture guards (pipeline §5 — constraints, gated not hoped-for):
 *  - `packages/core` is engine-agnostic & pure: it may NOT import the renderer,
 *    the web app, or any DOM/Canvas surface.
 *  - `packages/core` is deterministic: NO wall-clock (`Date.now`, `new Date`,
 *    `performance.now`) and NO `Math.random` — the clock and RNG are injected.
 * A rule that isn't gated will be violated, so both live here AND in the gate.
 */

const DETERMINISM_FORBIDDEN_SYNTAX = [
  {
    selector:
      "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message:
      'core must be deterministic: no Math.random — take a seeded Rng via injection.',
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'core must be deterministic: no Date.now — take a Clock via injection.',
  },
  {
    selector: "NewExpression[callee.name='Date']",
    message:
      'core must be deterministic: no `new Date()` — take a Clock via injection.',
  },
  {
    selector:
      "CallExpression[callee.object.name='performance'][callee.property.name='now']",
    message:
      'core must be deterministic: no performance.now — take a Clock via injection.',
  },
];

const CORE_FORBIDDEN_IMPORTS = {
  paths: [
    {
      name: '@skate/render-canvas',
      message: 'core is engine-agnostic: it must not import the renderer.',
    },
    {
      name: '@skate/web',
      message: 'core is engine-agnostic: it must not import the web app.',
    },
  ],
  patterns: [
    {
      group: ['@skate/render-canvas', '@skate/render-canvas/*', '@skate/web', '@skate/web/*'],
      message: 'core is engine-agnostic: it must not depend on render/app layers.',
    },
  ],
};

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.config.*', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
    },
  },
  // ── Arch-guard: core stays pure + deterministic ──
  {
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/**/*.test.ts', 'packages/core/src/**/*.golden.ts'],
    languageOptions: {
      globals: { window: 'off', document: 'off', performance: 'off' },
    },
    rules: {
      'no-restricted-syntax': ['error', ...DETERMINISM_FORBIDDEN_SYNTAX],
      'no-restricted-imports': ['error', CORE_FORBIDDEN_IMPORTS],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core is engine-agnostic: no DOM.' },
        { name: 'document', message: 'core is engine-agnostic: no DOM.' },
        { name: 'performance', message: 'core must inject a Clock, not read performance.' },
      ],
    },
  },
  // ── Renderer + app may not mutate the sim by importing core internals ──
  {
    files: ['packages/render-canvas/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@skate/core/src/*', '@skate/core/dist/*'],
              message:
                'import from the @skate/core public entry only — internals are not a contract.',
            },
          ],
        },
      ],
    },
  },
);
