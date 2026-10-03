import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Store/algorithm tests commonly do `let state; ...process(state)...; state = result.state;`
    // to thread reducer state through a stateful sequence of calls - a deliberate pattern the
    // mutation-tracking rules below misread as dead/reassignable code.
    files: [
      "**/__tests__/**/*.ts",
      "**/tests/**/*.ts",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
    rules: {
      "prefer-const": "off",
      "no-useless-assignment": "off",
      "no-unassigned-vars": "off",
    },
  },
  {
    // Build/test tooling and Claude Code hooks are plain Node CommonJS scripts,
    // unlike the ESM library source under packages/*/src.
    files: ["**/jest.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        require: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  eslintConfigPrettier,
);
