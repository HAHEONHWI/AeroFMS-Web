import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const pkg = (name: string) => fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@aerofms/shared': pkg('shared'),
      '@aerofms/navigation': pkg('navigation'),
      '@aerofms/core': pkg('core'),
      '@aerofms/aircraft': pkg('aircraft'),
      '@aerofms/simulation': pkg('simulation'),
      '@aerofms/training': pkg('training'),
      '@aerofms/i18n': pkg('i18n'),
      '@aerofms/ui': pkg('ui'),
      '@aerofms/cloud': pkg('cloud'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/connector/test/**/*.test.ts'],
    environment: 'node',
  },
})
