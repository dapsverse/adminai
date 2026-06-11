import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/adminai_test',
      JWT_SECRET: 'test-secret-minimum-32-chars-long!!',
    },
    setupFiles: [],
    pool: 'forks',
  },
})
