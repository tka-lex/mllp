module.exports = {
  parser: "@typescript-eslint/parser",
  env: {
    es6: true,
  },
  extends: [
    "airbnb",
    "airbnb/hooks",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "prettier/@typescript-eslint",
  ],
  plugins: ["jsx-a11y", "import", "prettier", "@typescript-eslint"],
  globals: {},
  rules: {
    // prettier
    "prettier/prettier": ["error"],
    "no-unexpected-multiline": "error",
    // TypeScript
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-member-accessibility": "off",
    "@typescript-eslint/no-object-literal-type-assertion": "off",
    "import/prefer-default-export": "off",
    "class-methods-use-this": "warn",
    // v4 changes
    "no-use-before-define": "off",
    "@typescript-eslint/no-use-before-define": ["error"],
    "no-shadow": "off",
    "@typescript-eslint/no-shadow": ["error"],
    // import
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        js: "never",
        mjs: "never",
        jsx: "never",
        ts: "never",
        tsx: "never",
      },
    ],
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".ts", ".jsx", ".tsx", ".json"],
      },
    },
    "import/extensions": [".js", ".ts", ".mjs", ".jsx", ".tsx"],
  },
};
