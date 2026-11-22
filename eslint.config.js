// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/ is Deno code (npm:/jsr: specifiers). It is checked with `npm run check:functions`.
    ignores: ['dist/*', 'supabase/**'],
  },
]);
