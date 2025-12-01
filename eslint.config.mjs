import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build outputs and generated files
    "deploy/**",
    "cloud-run-token-matcher/**",
    "**/*.min.js",
    "**/*.bundle.js",
    // Node.js scripts (use require() style imports)
    "scripts/**",
    // Data files
    "*.csv",
    "words*.json",
    "engWords*.csv",
    "NGSL*.csv",
    "oxford*.csv",
    "missing-words.csv",
  ]),
]);

export default eslintConfig;
