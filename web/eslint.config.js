// ESLint 9 flat config；TS strict 交由 tsc --noEmit（noUnusedLocals/Parameters）覆盖
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off", // tsc noUnusedLocals/Parameters 覆盖
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs", "*.config.*"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        require: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
      },
    },
  },
  {
    ignores: [
      "dist/",
      "node_modules/",
      "src-tauri/",
      "src/engine-adapter/vendor/",
      ".probe/",
      ".engine-tmp/",
      ".sprite-raw/",
      "public/",
      "coverage/",
      "release/",
    ],
  },
);
