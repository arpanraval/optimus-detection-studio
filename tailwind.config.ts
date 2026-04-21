import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Roboto', 'sans-serif'],
        brand: ['Orbitron', 'sans-serif'],
      },
      transitionTimingFunction: {
        emphasized: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
        'emphasized-decelerate': 'cubic-bezier(0.05, 0.7, 0.1, 1.0)',
        'emphasized-accelerate': 'cubic-bezier(0.3, 0.0, 0.8, 0.15)',
        standard: 'cubic-bezier(0.2, 0.0, 0, 1.0)',
      },
      colors: {
        primary: 'rgb(var(--md-sys-color-primary) / <alpha-value>)',
        'on-primary': 'rgb(var(--md-sys-color-on-primary) / <alpha-value>)',
        'primary-container': 'rgb(var(--md-sys-color-primary-container) / <alpha-value>)',
        'on-primary-container': 'rgb(var(--md-sys-color-on-primary-container) / <alpha-value>)',

        secondary: 'rgb(var(--md-sys-color-secondary) / <alpha-value>)',
        'on-secondary': 'rgb(var(--md-sys-color-on-secondary) / <alpha-value>)',
        'secondary-container': 'rgb(var(--md-sys-color-secondary-container) / <alpha-value>)',
        'on-secondary-container': 'rgb(var(--md-sys-color-on-secondary-container) / <alpha-value>)',

        tertiary: 'rgb(var(--md-sys-color-tertiary) / <alpha-value>)',
        'on-tertiary': 'rgb(var(--md-sys-color-on-tertiary) / <alpha-value>)',
        'tertiary-container': 'rgb(var(--md-sys-color-tertiary-container) / <alpha-value>)',
        'on-tertiary-container': 'rgb(var(--md-sys-color-on-tertiary-container) / <alpha-value>)',

        error: 'rgb(var(--md-sys-color-error) / <alpha-value>)',
        'on-error': 'rgb(var(--md-sys-color-on-error) / <alpha-value>)',
        'error-container': 'rgb(var(--md-sys-color-error-container) / <alpha-value>)',
        'on-error-container': 'rgb(var(--md-sys-color-on-error-container) / <alpha-value>)',

        background: 'rgb(var(--md-sys-color-background) / <alpha-value>)',
        'on-background': 'rgb(var(--md-sys-color-on-background) / <alpha-value>)',

        surface: 'rgb(var(--md-sys-color-surface) / <alpha-value>)',
        'on-surface': 'rgb(var(--md-sys-color-on-surface) / <alpha-value>)',
        'surface-variant': 'rgb(var(--md-sys-color-surface-variant) / <alpha-value>)',
        'on-surface-variant': 'rgb(var(--md-sys-color-on-surface-variant) / <alpha-value>)',

        'surface-container-lowest': 'rgb(var(--md-sys-color-surface-container-lowest) / <alpha-value>)',
        'surface-container-low': 'rgb(var(--md-sys-color-surface-container-low) / <alpha-value>)',
        'surface-container': 'rgb(var(--md-sys-color-surface-container) / <alpha-value>)',
        'surface-container-high': 'rgb(var(--md-sys-color-surface-container-high) / <alpha-value>)',
        'surface-container-highest': 'rgb(var(--md-sys-color-surface-container-highest) / <alpha-value>)',

        'surface-tint': 'rgb(var(--md-sys-color-surface-tint) / <alpha-value>)',
        'surface-dim': 'rgb(var(--md-sys-color-surface-dim) / <alpha-value>)',
        'surface-bright': 'rgb(var(--md-sys-color-surface-bright) / <alpha-value>)',

        'inverse-surface': 'rgb(var(--md-sys-color-inverse-surface) / <alpha-value>)',
        'inverse-on-surface': 'rgb(var(--md-sys-color-inverse-on-surface) / <alpha-value>)',
        'inverse-primary': 'rgb(var(--md-sys-color-inverse-primary) / <alpha-value>)',

        shadow: 'rgb(var(--md-sys-color-shadow) / <alpha-value>)',
        scrim: 'rgb(var(--md-sys-color-scrim) / <alpha-value>)',

        outline: 'rgb(var(--md-sys-color-outline) / <alpha-value>)',
        'outline-variant': 'rgb(var(--md-sys-color-outline-variant) / <alpha-value>)',

        // Fixed accent colors (theme-independent)
        'primary-fixed': 'rgb(var(--md-sys-color-primary-fixed) / <alpha-value>)',
        'primary-fixed-dim': 'rgb(var(--md-sys-color-primary-fixed-dim) / <alpha-value>)',
        'on-primary-fixed': 'rgb(var(--md-sys-color-on-primary-fixed) / <alpha-value>)',
        'on-primary-fixed-variant': 'rgb(var(--md-sys-color-on-primary-fixed-variant) / <alpha-value>)',
        'secondary-fixed': 'rgb(var(--md-sys-color-secondary-fixed) / <alpha-value>)',
        'secondary-fixed-dim': 'rgb(var(--md-sys-color-secondary-fixed-dim) / <alpha-value>)',
        'on-secondary-fixed': 'rgb(var(--md-sys-color-on-secondary-fixed) / <alpha-value>)',
        'on-secondary-fixed-variant': 'rgb(var(--md-sys-color-on-secondary-fixed-variant) / <alpha-value>)',
        'tertiary-fixed': 'rgb(var(--md-sys-color-tertiary-fixed) / <alpha-value>)',
        'tertiary-fixed-dim': 'rgb(var(--md-sys-color-tertiary-fixed-dim) / <alpha-value>)',
        'on-tertiary-fixed': 'rgb(var(--md-sys-color-on-tertiary-fixed) / <alpha-value>)',
        'on-tertiary-fixed-variant': 'rgb(var(--md-sys-color-on-tertiary-fixed-variant) / <alpha-value>)',

        // Extended colors (from Material Theme Builder)
        'ext-blue': 'rgb(var(--md-ext-color-blue) / <alpha-value>)',
        'on-ext-blue': 'rgb(var(--md-ext-color-on-blue) / <alpha-value>)',
        'ext-blue-container': 'rgb(var(--md-ext-color-blue-container) / <alpha-value>)',
        'on-ext-blue-container': 'rgb(var(--md-ext-color-on-blue-container) / <alpha-value>)',

        'ext-indigo': 'rgb(var(--md-ext-color-indigo) / <alpha-value>)',
        'on-ext-indigo': 'rgb(var(--md-ext-color-on-indigo) / <alpha-value>)',
        'ext-indigo-container': 'rgb(var(--md-ext-color-indigo-container) / <alpha-value>)',
        'on-ext-indigo-container': 'rgb(var(--md-ext-color-on-indigo-container) / <alpha-value>)',

        'ext-violet': 'rgb(var(--md-ext-color-violet) / <alpha-value>)',
        'on-ext-violet': 'rgb(var(--md-ext-color-on-violet) / <alpha-value>)',
        'ext-violet-container': 'rgb(var(--md-ext-color-violet-container) / <alpha-value>)',
        'on-ext-violet-container': 'rgb(var(--md-ext-color-on-violet-container) / <alpha-value>)',

        'ext-rose': 'rgb(var(--md-ext-color-rose) / <alpha-value>)',
        'on-ext-rose': 'rgb(var(--md-ext-color-on-rose) / <alpha-value>)',
        'ext-rose-container': 'rgb(var(--md-ext-color-rose-container) / <alpha-value>)',
        'on-ext-rose-container': 'rgb(var(--md-ext-color-on-rose-container) / <alpha-value>)',

        'ext-coral': 'rgb(var(--md-ext-color-coral) / <alpha-value>)',
        'on-ext-coral': 'rgb(var(--md-ext-color-on-coral) / <alpha-value>)',
        'ext-coral-container': 'rgb(var(--md-ext-color-coral-container) / <alpha-value>)',
        'on-ext-coral-container': 'rgb(var(--md-ext-color-on-coral-container) / <alpha-value>)',

        'ext-orange': 'rgb(var(--md-ext-color-orange) / <alpha-value>)',
        'on-ext-orange': 'rgb(var(--md-ext-color-on-orange) / <alpha-value>)',
        'ext-orange-container': 'rgb(var(--md-ext-color-orange-container) / <alpha-value>)',
        'on-ext-orange-container': 'rgb(var(--md-ext-color-on-orange-container) / <alpha-value>)',

        'ext-amber': 'rgb(var(--md-ext-color-amber) / <alpha-value>)',
        'on-ext-amber': 'rgb(var(--md-ext-color-on-amber) / <alpha-value>)',
        'ext-amber-container': 'rgb(var(--md-ext-color-amber-container) / <alpha-value>)',
        'on-ext-amber-container': 'rgb(var(--md-ext-color-on-amber-container) / <alpha-value>)',

        'ext-green': 'rgb(var(--md-ext-color-green) / <alpha-value>)',
        'on-ext-green': 'rgb(var(--md-ext-color-on-green) / <alpha-value>)',
        'ext-green-container': 'rgb(var(--md-ext-color-green-container) / <alpha-value>)',
        'on-ext-green-container': 'rgb(var(--md-ext-color-on-green-container) / <alpha-value>)',

        'ext-teal': 'rgb(var(--md-ext-color-teal) / <alpha-value>)',
        'on-ext-teal': 'rgb(var(--md-ext-color-on-teal) / <alpha-value>)',
        'ext-teal-container': 'rgb(var(--md-ext-color-teal-container) / <alpha-value>)',
        'on-ext-teal-container': 'rgb(var(--md-ext-color-on-teal-container) / <alpha-value>)',

        'ext-cyan': 'rgb(var(--md-ext-color-cyan) / <alpha-value>)',
        'on-ext-cyan': 'rgb(var(--md-ext-color-on-cyan) / <alpha-value>)',
        'ext-cyan-container': 'rgb(var(--md-ext-color-cyan-container) / <alpha-value>)',
        'on-ext-cyan-container': 'rgb(var(--md-ext-color-on-cyan-container) / <alpha-value>)',

        // Compat mapping
        'brand-primary': 'rgb(var(--md-sys-color-primary) / <alpha-value>)',
        'brand-secondary': 'rgb(var(--md-sys-color-secondary) / <alpha-value>)',
        card: 'rgb(var(--md-sys-color-surface-container-low) / <alpha-value>)',
        border: 'rgb(var(--md-sys-color-outline-variant) / <alpha-value>)',
        'text-primary': 'rgb(var(--md-sys-color-on-surface) / <alpha-value>)',
        'text-secondary': 'rgb(var(--md-sys-color-on-surface-variant) / <alpha-value>)',
        'text-tertiary': 'rgb(var(--md-sys-color-outline) / <alpha-value>)',
        'hover-bg': 'rgb(var(--md-sys-color-surface-container-highest) / <alpha-value>)',
      },
      borderRadius: {
        xl: '16px',
        '2xl': '24px',
        '3xl': '28px',
        '4xl': '32px',
      },
      animation: {
        'fade-in': 'fadeIn 400ms cubic-bezier(0.2, 0.0, 0, 1.0)',
        'slide-up': 'slideUp 500ms cubic-bezier(0.05, 0.7, 0.1, 1.0)',
        'enter-scale': 'enterScale 400ms cubic-bezier(0.05, 0.7, 0.1, 1.0)',
        'slide-right': 'slideRight 300ms cubic-bezier(0.2, 0.0, 0, 1.0)',
        'spin-slow': 'spin 4s linear infinite',
        'spin-fast': 'spin 0.3s linear infinite',
        'spool-up': 'spoolUp 1.2s cubic-bezier(0.33, 1, 0.68, 1) forwards',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-left': 'slideLeft 300ms cubic-bezier(0.2, 0.0, 0, 1.0)',
        'fade-out': 'fadeOut 300ms cubic-bezier(0.2, 0.0, 0, 1.0) forwards',
        shrink: 'shrink linear forwards',
        shimmer: 'shimmer 2s infinite linear',
        'page-enter': 'pageEnter 250ms cubic-bezier(0.2, 0.0, 0, 1.0)',
        'stream-flow': 'streamFlow 0.8s linear infinite',
        'stream-flow-slow': 'streamFlow 3s linear infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'glow-pulse-fast': 'glowPulse 1s ease-in-out infinite',
        'node-spin': 'nodeSpin 3s linear infinite',
        'node-spin-decel': 'nodeSpinDecel 2s cubic-bezier(0.2, 0.0, 0, 1.0) forwards',
        'counter-settle': 'counterSettle 300ms cubic-bezier(0.05, 0.7, 0.1, 1.0)',
        'power-down': 'powerDown 2s cubic-bezier(0.2, 0.0, 0, 1.0) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        enterScale: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        spoolUp: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(1080deg)' },
        },
        slideLeft: {
          '0%': { opacity: '0', transform: 'translateX(100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        shrink: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        cyberGlyphFade: {
          '0%, 100%': { opacity: '0' },
          '20%, 80%': { opacity: '1' },
        },
        pageEnter: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        streamFlow: {
          '0%': { strokeDashoffset: '0' },
          '100%': { strokeDashoffset: '-20' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4', filter: 'blur(4px)' },
          '50%': { opacity: '0.8', filter: 'blur(8px)' },
        },
        nodeSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        nodeSpinDecel: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(720deg)' },
        },
        counterSettle: {
          '0%': { transform: 'scale(1.15)', opacity: '0.7' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        powerDown: {
          '0%': { opacity: '1', filter: 'brightness(1.2)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.0)' },
          '100%': { opacity: '0.6', filter: 'brightness(0.9)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
