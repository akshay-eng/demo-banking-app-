/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mc: {
          red: '#EB001B',
          orange: '#F79E1B',
          dark: '#0A0A0F',
          card: '#111118',
          surface: '#1A1A24',
          border: '#2A2A38',
          muted: '#6B7280',
        },
      },
      backgroundImage: {
        'mc-gradient': 'linear-gradient(135deg, #EB001B 0%, #F79E1B 100%)',
        'card-gradient': 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
