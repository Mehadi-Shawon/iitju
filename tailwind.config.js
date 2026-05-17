/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#4648d4',
          dark: '#3234b0',
          light: '#e1e0ff',
          glow: 'rgba(70,72,212,0.15)',
        },
        surface: {
          DEFAULT: '#f9f9ff',
          low: '#f0f3ff',
          high: '#dee8ff',
          highest: '#d8e3fb',
        },
        border: {
          DEFAULT: '#c7c4d7',
          light: 'rgba(199,196,215,0.5)',
        },
        text: {
          DEFAULT: '#111c2d',
          muted: '#464554',
          faint: '#767586',
        },
      },
      borderRadius: {
        DEFAULT: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(17,28,45,0.06), 0 1px 2px rgba(17,28,45,0.04)',
        md: '0 4px 12px rgba(17,28,45,0.08), 0 2px 4px rgba(17,28,45,0.04)',
        lg: '0 12px 32px rgba(17,28,45,0.10), 0 4px 8px rgba(17,28,45,0.05)',
        primary: '0 4px 20px rgba(70,72,212,0.25)',
      },
    },
  },
  plugins: [],
}
