/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
        serif: ['Playfair Display', 'serif'],
        handwritten: ['Caveat', 'cursive'],
      },
      colors: {
        pinterest: {
          red: '#E60023',
          dark: '#111111',
          light: '#EFEFEF',
          gray: '#767676',
        },
        aesthetic: {
          cream: '#FAF6F0',
          sand: '#EAE3D2',
          clay: '#D4C3B3',
          sage: '#E0E7E1',
          rose: '#F8EAE8',
          lavender: '#EFEBF4',
          apricot: '#FBECE3',
          vintage: '#1E1E1D',
        }
      },
      boxShadow: {
        'pinterest': '0 1px 20px 0 rgba(0, 0, 0, 0.06)',
        'premium': '0 10px 30px -10px rgba(0, 0, 0, 0.08)',
        'card': '0 4px 12px rgba(0, 0, 0, 0.03), 0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      animation: {
        'flash': 'flashEffect 0.6s ease-out forwards',
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        flashEffect: {
          '0%': { opacity: '0' },
          '10%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        }
      }
    },
  },
  plugins: [],
}
