/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        canvas: '#F7F8FA',
        ink: '#111827',
        muted: '#667085',
        brand: '#2563EB',
        success: '#15803D',
        warning: '#B45309',
        danger: '#B42318'
      },
      borderRadius: {
        card: '20px'
      }
    }
  },
  plugins: []
};
