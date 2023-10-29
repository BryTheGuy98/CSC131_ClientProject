module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    "ecmaVersion": 15,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "no-restricted-globals": [ "error", "name", "length" ],
    "prefer-arrow-callback": "error",
    "quotes": [ "error", "double", { "allowTemplateLiterals": true } ],
    "max-len": [ "warn", { "code": 120 } ],
    "object-curly-spacing": [ "error", "always" ],
    "array-bracket-spacing": [ "error", "always" ],
    "space-in-parens": [ "error", "always" ],
  },
  overrides: [
    {
      files: [ "**/*.spec.*" ],
      env: {
        mocha: true,
      },
      rules: {
      },
    },
  ],
  globals: {},
};
