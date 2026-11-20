import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// NFR-8: ユーザーのデータを外部に送信しないよう、通信 API の使用を禁止する。
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'];
const networkMessage = 'NFR-8: このアプリでは外部通信を行いません。';

export default tseslint.config(
  { ignores: ['dist', 'coverage', '.perf-profile'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 開発用スクリプト（Node で動かす。アプリには含まれないので、通信の禁止ルールは対象外）
    files: ['scripts/**/*.cjs'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-globals': [
        'error',
        ...networkGlobals.map((name) => ({ name, message: networkMessage })),
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].flatMap((object) =>
          networkGlobals.map((property) => ({ object, property, message: networkMessage })),
        ),
        { object: 'navigator', property: 'sendBeacon', message: networkMessage },
      ],
    },
  },
);
