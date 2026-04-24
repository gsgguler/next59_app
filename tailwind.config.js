/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#e6edf5',
          100: '#ccdaeb',
          200: '#99b5d7',
          300: '#6690c3',
          400: '#336baf',
          500: '#0d4a8a',
          600: '#0b3d72',
          700: '#0d2b4e',
          800: '#091e36',
          900: '#05101e',
          950: '#030912',
        },
        gold: {
          50: '#fdf8ef',
          100: '#faf0db',
          200: '#f2dab0',
          300: '#e6c27e',
          400: '#d4a84f',
          500: '#c8973a',
          600: '#a87b2e',
          700: '#886027',
          800: '#694a20',
          900: '#4a3417',
          950: '#2d1f0e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
