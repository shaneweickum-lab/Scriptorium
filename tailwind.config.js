/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1e293b',
          raised: '#273549',
          overlay: '#334155',
        },
        accent: {
          DEFAULT: '#818cf8',
          hover: '#6366f1',
        },
      },
      fontFamily: {
        prose: ['Georgia', 'Cambria', 'serif'],
        ui: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
