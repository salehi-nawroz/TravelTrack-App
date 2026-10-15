/* eslint-env node */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import eslint from "vite-plugin-eslint";

// https://vitejs.dev/config/
export default defineConfig({
  // ESLint runs through `npm run lint`; skipping it under Vitest keeps test
  // output to test results.
  plugins: [react(), !process.env.VITEST && eslint()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
