// ESLint 9 flat config；M0 完成时按锁定的版本复核规则集（docs/00 §6.2/§6.5：TS strict、禁用 any）
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "off", // 交由 tsc --noEmit（noUnusedLocals/Parameters）覆盖
    },
  },
  {
    ignores: ["dist/", "node_modules/", "src-tauri/target/", "src/data/"],
  },
];
