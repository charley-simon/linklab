/**
 * Exemple d'intégration Netflix
 * Fichier à titre d'exemple uniquement, non exporté.
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path              from 'path'
import Fastify           from 'fastify'
import { linklabPlugin } from './index.js'

const require   = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir   = path.join(__dirname, '../examples/netflix/data')

const compiledGraph = require('../examples/netflix/compiled-graph.json')
const movies        = require(path.join(dataDir, 'movies.json'))
const people        = require(path.join(dataDir, 'people.json'))
const credits       = require(path.join(dataDir, 'credits.json'))
const categories    = require(path.join(dataDir, 'categories.json'))
const departments   = require(path.join(dataDir, 'departments.json'))
const jobs          = require(path.join(dataDir, 'jobs.json'))

const fastify = Fastify({ logger: true })

await fastify.register(linklabPlugin, {
  graph:  compiledGraph,
  prefix: '/api',
  global: { domain: 'netflix', version: 'v1' },

  dataLoader: {
    dataset: { movies, people, credits, categories, departments, jobs }
  },

  extractUser: async (req) => {
    const auth = req.headers.authorization
    if (!auth) return {}
    return { userId: 'u_123', subscription: 'premium', locale: 'fr-FR' }
  },

  onEngine: (engine, req) => {
    const accessHandler: any = async (ctx: any) => {
      const protected_ = ['movies', 'series', 'episodes']
      if (protected_.includes(ctx.node) && !ctx.trail?.user?.subscription) {
        return { cancelled: true, reason: 'subscription_required' }
      }
      return undefined
    }
    engine.hooks.on('access.check', accessHandler)
    engine.events.on('traversal.complete', ({ routeUsed, durationMs }) => {
      fastify.log.info({ routeUsed, durationMs }, 'traversal')
    })
    engine.errors.on('route.notfound', ({ from, to }) => {
      fastify.log.warn({ from, to }, 'route not found')
    })
  },
})

await fastify.listen({ port: 3000 })
