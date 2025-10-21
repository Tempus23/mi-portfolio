	export default {
	content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
	darkMode: 'class',
	theme: {
		extend: {
			colors: {
				primary: '#6366F1', // Indigo 500
				secondary: '#8B5CF6', // Violet 500
				dark: '#1A202C', // Dark Gray
				light: '#F7FAFC', // Light Gray
			},
			fontFamily: {
				sans: ['Inter', 'sans-serif'],
			},
		},
	},
	plugins: [],
}
