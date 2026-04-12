/**
 * dvdrental.linklab.ts — Configuration LinkLab pour 'dvdrental'
 * defineConfig() est un pass-through pour l'autocomplétion IDE.
 */
function defineConfig<T>(config: T): T { return config }

export default defineConfig({
  alias: 'dvdrental',
  source: {
    type: 'postgres',
    connectionString: process.env.DATABASE_URL,
    host: 'localhost',
    port: 5432,
    database: 'dvdrental',
    user: 'postgres',
    password: 'admin'
  },
  output: {
    dir: './linklab/dvdrental'
}
})
