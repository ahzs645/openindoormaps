/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },

  extends: ["eslint:recommended", "prettier"],
  plugins: ["check-file", "unused-imports", "prettier"],

  overrides: [
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: [
        "react",
        "jsx-a11y",
        "react-hooks",
        "tailwindcss",
        "unicorn",
        "@typescript-eslint",
        "import",
      ],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
        "plugin:tailwindcss/recommended",
        "plugin:prettier/recommended",
        "plugin:unicorn/recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
      settings: {
        react: {
          version: "detect",
        },
        "import/resolver": {
          node: {
            extensions: [".js", ".jsx", ".ts", ".tsx"],
          },
          typescript: {},
        },
      },
      rules: {
        "@typescript-eslint/explicit-function-return-type": ["off"],
        "react/function-component-definition": [
          "error",
          {
            namedComponents: "function-declaration",
            unnamedComponents: "arrow-function",
          },
        ],
        "no-unused-vars": "off",
        "unused-imports/no-unused-imports": "error",
        "unused-imports/no-unused-vars": [
          "warn",
          {
            vars: "all",
            varsIgnorePattern: "^_",
            args: "after-used",
            argsIgnorePattern: "^_",
          },
        ],
        "check-file/folder-naming-convention": [
          "error",
          {
            "**/*": "KEBAB_CASE",
          },
        ],
        "unicorn/prevent-abbreviations": "off",
        "unicorn/no-array-for-each": "off",
        "unicorn/no-null": "off",
        "no-nested-ternary": "error",
        "unicorn/prefer-module": "off",
        "react/prop-types": "off",
      },
    },
    {
      // Geometry algorithms and their audit fixtures use inline predicates,
      // reductions and nested classifications; retain correctness rules.
      files: ["app/indoor-project/**/*.{ts,tsx}", "app/pages/indoor-project-page.tsx", "scripts/indoor/**/*.ts", "tests/**/*.ts"],
      rules: {
        "no-nested-ternary": "off",
        "unicorn/no-nested-ternary": "off",
        "unicorn/no-array-reduce": "off",
        "unicorn/no-array-callback-reference": "off",
        "unicorn/consistent-function-scoping": "off",
        "unicorn/prefer-add-event-listener": "off",
        "unicorn/number-literal-case": "off",
        "@typescript-eslint/no-unused-vars": ["error", {"argsIgnorePattern":"^_", "varsIgnorePattern":"^_", "ignoreRestSiblings":true}],
      },
    },
    {
      files: ["tests/**/*.ts", "scripts/indoor/**/*.ts"],
      rules: {
        "unicorn/no-await-expression-member": "off",
        "unicorn/no-magic-array-flat-depth": "off",
        "unicorn/no-array-push-push": "off",
      },
    },
  ],
};
