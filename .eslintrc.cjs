module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  settings: { react: { version: 'detect' } },
  parser: '@typescript-eslint/parser',
  plugins: ['react', '@typescript-eslint'],
  ignorePatterns: ['dist', 'build', 'node_modules'],
  rules: {
    'react/react-in-jsx-scope': 'off'
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parserOptions: { project: false }
    }
  ]
};




