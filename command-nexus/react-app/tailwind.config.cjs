const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{ts,tsx,jsx,js}')],
  theme: {
    extend: {
      colors: {
        ops: {
          base: '#0f172a',
          accent: '#0ea5e9'
        },
        executive: {
          base: '#f5f5f4',
          accent: '#7c3aed'
        }
      }
    }
  },
  plugins: []
};

