import { defineConfig } from 'vitest/config';

// Unit tests for Supabase Edge Function logic (supabase/functions/**).
// The modules under test are runtime-agnostic TypeScript; Deno-only code
// stays in the thin index.ts entrypoints, which are not imported here.
export default defineConfig({
  test: {
    include: ['supabase/functions/**/*.test.ts'],
  },
});
