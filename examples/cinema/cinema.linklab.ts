/**
 * cinema.linklab.ts — Configuration LinkLab pour 'cinema'
 * defineConfig() est un pass-through pour l'autocomplétion IDE.
 */
function defineConfig<T>(config: T): T { return config }

export default defineConfig({
  alias: 'cinema',
  source: {
    type: 'json',
    dataDir: './data'
    // connectionString: process.env.DATABASE_URL,
    // host: 'localhost',
    // port: 5432,
    // database: 'cinema',
    // user: 'postgres',
    // password: process.env.PGPASSWORD,
  },
  // output: {
  //   dir: './linklab/cinema',  ← défaut automatique
  // },
})
