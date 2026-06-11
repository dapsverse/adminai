import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/adminai_test',
      JWT_SECRET: 'test-secret-minimum-32-chars-long!!',
    },
    pool: 'forks',
    fileParallelism: false,
  },
})
