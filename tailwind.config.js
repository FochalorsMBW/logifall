/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Spectral', 'Georgia', 'Cambria', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        paper: {
          50: '#fbfaf7',
          100: '#f4f1ea',
        },
        ink: {
          700: '#27313f',
          800: '#1c2530',
          900: '#131a22',
        },
      },
    },
  },
  plugins: [],
};
