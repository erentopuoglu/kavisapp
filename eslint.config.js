// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions: Deno runtime'ı için ayrı, bu projenin
    // Node/RN odaklı ESLint kurulumu Deno globallerini/uzak import'ları
    // tanımıyor.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
