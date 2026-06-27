import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ham-radio-meetings/",
  plugins: [react()]
});
