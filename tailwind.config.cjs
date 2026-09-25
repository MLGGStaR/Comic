/** @type {import('tailwindcss').Config} */
// Same palette + type as letterSizd so the two apps feel like siblings.
module.exports = {
  content: ['./index.html', './src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lb: { green: '#00d735', orange: '#ff8000', blue: '#40bcf4' },
        bg: { 0: '#1c2233', 1: '#262f43', 2: '#34405e' },
        ink: { 0: '#f2f5fa', 1: '#aeb9ca', 2: '#8391a5' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
