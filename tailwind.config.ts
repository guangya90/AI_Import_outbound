import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e8fafa',
          100: '#d0f3f2',
          200: '#b5e8e8',
          300: '#7fd9d7',
          400: '#3fc8c5',
          500: '#0fc6c2',
          600: '#0bada9',
          700: '#0b6e6e',
          800: '#085354',
          900: '#053334'
        }
      },
      boxShadow: {
        card: '0 2px 12px rgba(15, 198, 194, 0.06)',
        'card-hover': '0 4px 20px rgba(15, 198, 194, 0.12)'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};

export default config;
