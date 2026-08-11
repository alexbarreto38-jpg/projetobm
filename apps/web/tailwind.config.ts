import type { Config } from 'tailwindcss';

/**
 * Tema Wise (spec §73): preto, branco e amarelo como destaque. Visual limpo,
 * profissional — nada de painel administrativo genérico antigo.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        wise: {
          bg: '#0a0a0b', // fundo escuro
          surface: '#141416',
          border: '#24242a',
          muted: '#8a8a94',
          text: '#f5f5f7',
          yellow: '#f5c518', // amarelo de destaque
          yellowDim: '#c99f0f',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
      },
    },
  },
  plugins: [],
};

export default config;
