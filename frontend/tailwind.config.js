/** @type {import('tailwindcss').Config} */
import containerQueries from '@tailwindcss/container-queries';
import tailwindThemePlugin from '../docs/design-system/tailwind-theme/examples/tailwind-theme-plugin/index.cjs.js';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [
    tailwindThemePlugin,
    containerQueries,
  ],
};
