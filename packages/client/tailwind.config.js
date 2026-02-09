/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Kanit', 'sans-serif'],
            },
            colors: {
                'ink-primary': '#CCFF00', // Acid Lime
                'ink-secondary': '#7000FF', // Electric Violet
                'ink-accent': '#00FFFF', // Cyan
                'ink-danger': '#FF0055', // Hot Pink/Red
                'ink-bg': '#0A0A10', // Deep Void
                'ink-surface': '#181820', // Gunmetal
                'ink-surface-highlight': '#252530',
            },
            boxShadow: {
                'ink-hard': '4px 4px 0px 0px #000000',
                'ink-hard-lg': '8px 8px 0px 0px #000000',
                'ink-hard-xl': '12px 12px 0px 0px #000000',
                'ink-glow': '0 0 15px rgba(204, 255, 0, 0.5)',
            },
            animation: {
                'bounce-slow': 'bounce 3s infinite',
                'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }
        },
    },
    plugins: [],
}
