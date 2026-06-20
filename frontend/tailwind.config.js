/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'surface-container': '#002331',
        'surface-bright': '#0a3e52',
        'on-tertiary': '#00363d',
        'background': '#001620',
        'on-primary-fixed': '#281800',
        'error': '#ffb4ab',
        'on-error': '#690005',
        'surface-tint': '#ffba43',
        'inverse-on-surface': '#003548',
        'on-surface': '#c1e8ff',
        'tertiary-fixed': '#9cf0ff',
        'tertiary-fixed-dim': '#00daf3',
        'on-error-container': '#ffdad6',
        'outline-variant': '#524533',
        'surface-container-lowest': '#001019',
        'tertiary-container': '#00d3eb',
        'primary': '#ffd597',
        'secondary-fixed-dim': '#00e639',
        'tertiary': '#7cecff',
        'on-primary': '#432c00',
        'surface-container-low': '#001e2b',
        'surface-container-high': '#002e3f',
        'secondary-fixed': '#72ff70',
        'on-tertiary-container': '#005761',
        'inverse-primary': '#805600',
        'on-primary-fixed-variant': '#614000',
        'on-secondary': '#003907',
        'on-primary-container': '#6a4700',
        'on-tertiary-fixed-variant': '#004f58',
        'surface-variant': '#02394d',
        'on-secondary-fixed': '#002203',
        'outline': '#9f8e78',
        'secondary': '#ecffe3',
        'on-background': '#c1e8ff',
        'secondary-container': '#13ff43',
        'on-secondary-fixed-variant': '#00530e',
        'on-secondary-container': '#007117',
        'surface-container-highest': '#02394d',
        'on-surface-variant': '#d7c4ac',
        'inverse-surface': '#c1e8ff',
        'on-tertiary-fixed': '#001f24',
        'primary-container': '#ffb000',
        'surface-dim': '#001620',
        'surface': '#001620',
        'error-container': '#93000a',
        'primary-fixed': '#ffddaf',
        'primary-fixed-dim': '#ffba43'
      },
      borderRadius: {
        DEFAULT: '0px',
        lg: '0px',
        xl: '0px',
        full: '9999px'
      },
      fontFamily: {
        headline: ['Space Grotesk'],
        body: ['Space Grotesk'],
        label: ['Space Grotesk'],
        mono: ['Fira Code', 'Space Mono', 'monospace']
      }
    }
  },
  plugins: []
}
