import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// port 3000 matches CLIENT_ORIGIN and APP_URL in the backend .env
export default defineConfig({ plugins: [react()], server: { port: 3000 } });
