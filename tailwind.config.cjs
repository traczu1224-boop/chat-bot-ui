/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        base: {
          900: '#0f1115',
          800: '#141720',
          700: '#1c202b',
          600: '#242938'
        },
        accent: {
          500: '#6ea8ff',
          400: '#8cbcff'
        }
      },
      boxShadow: {
        soft: '0 10px 30px rgba(0, 0, 0, 0.25)'
      }
    }
  },
  plugins: []
};
