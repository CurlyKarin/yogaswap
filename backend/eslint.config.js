const tseslint = require("typescript-eslint");

module.exports = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "zips/**",
      // generated build artifacts (some older builds live here)
      "src/dist/**",
      "src/lambdas/shared/dynamoClient.js",
      // plain JS utility scripts (not worth linting right now)
      "scripts/**",
      "**/*.d.ts",
    ],
  },
  ...tseslint.config(
    tseslint.configs.recommended,
    {
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: "commonjs",
      },
      rules: {
        // Keep this lightweight; we already typecheck via `tsc --noEmit`.
        "no-console": "off",
        // Keep unused vars strict in TS sources.
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "prefer-const": "off",
      },
    },
  ),
  // This file is a one-off script; keep lint strict elsewhere.
  {
    files: ["src/scripts/migrate_users.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];

