import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/nb-gas-price-dashboard/', // 必须与 GitHub repository 名称一致
})
