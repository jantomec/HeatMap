import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const typedTypeScriptConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ['**/*.ts'],
  languageOptions: {
    ...config.languageOptions,
    parserOptions: {
      ...config.languageOptions?.parserOptions,
      project: ['./tsconfig.json', './tsconfig.test.json'],
      tsconfigRootDir: import.meta.dirname
    }
  }
}));

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vscode-test/**']
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly'
      }
    }
  },
  js.configs.recommended,
  ...typedTypeScriptConfigs,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports'
        }
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: {
            attributes: false
          }
        }
      ]
    }
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off'
    }
  }
];
