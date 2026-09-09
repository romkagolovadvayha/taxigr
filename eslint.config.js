// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error',
        {
          selector: "CallExpression[callee.computed=false][callee.property.name='at']",
          message: 'Use array indexing: Array.at is unavailable in older web browsers (Safari 15.3, Chrome 79).',
        },
        {
          selector: "CallExpression[callee.computed=false][callee.property.name='replaceAll']",
          message: 'Use replace with a global regular expression for older web browsers.',
        },
      ],
    },
  }
]);
