// eslint-disable-next-line unicorn/import-style
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", "public/**", "next.config.js", "postcss.config.js"] },
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"] },
  eslintPluginUnicorn.configs.recommended,
  {
    rules: {
      "no-undef": "error",
      "unicorn/better-regex": "warn",
      "unicorn/empty-brace-spaces": "warn",
      "unicorn/filename-case": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-lonely-if": "off",
      "unicorn/no-array-for-each": "warn",
      "unicorn/no-null": "warn",
      // "unicorn/no-useless-undefined": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "no-console": "warn",
    },
  },
];

export default eslintConfig;
