/**
 * Actions du scénario Netflix
 *
 * Simule le parcours d'un utilisateur qui :
 *   1. Voit la liste des films d'un réalisateur (déjà en contexte)
 *   2. Sélectionne un film
 *   3. Navigue vers les acteurs
 *   4. Sélectionne un acteur
 *   5. Explore les options à partir de cet acteur
 */

import type { ScheduleAction, Frame } from '../../types/index.js'

const actions: ScheduleAction[] = [
  {
    name: 'selectMovie',
    weight: 10,
    // Movies est résolu (liste chargée) mais pas encore d'ID choisi
    when: (stack: Frame[]) => {
      const movies = stack.find(f => f.entity === 'Movies')
      return movies?.state === 'RESOLVED' && movies.id == null
    },
    execute: async (stack: Frame[]) => {
      console.log('  🎬 [selectMovie] L\'utilisateur choisit un film dans la liste...')
      const movies = stack.find(f => f.entity === 'Movies')
      if (movies) {
        movies.id = 10
        console.log('  ✓ Film #10 sélectionné')
      }
      return stack
    },
    cooldown: 0
  },

  {
    name: 'navigateToActors',
    weight: 8,
    // Un film est sélectionné, mais pas encore de frame Actors
    when: (stack: Frame[]) => {
      const movies = stack.find(f => f.entity === 'Movies')
      const actors = stack.find(f => f.entity === 'Actors')
      return !!movies && movies.id != null && !actors
    },
    execute: async (stack: Frame[]) => {
      console.log('  🎭 [navigateToActors] L\'utilisateur clique sur "Voir les acteurs"...')
      stack.push({ entity: 'Actors', state: 'UNRESOLVED' })
      console.log('  ✓ Frame Actors ajoutée à la stack')
      return stack
    },
    cooldown: 0
  },

  {
    name: 'selectActor',
    weight: 5,
    // Actors existe, est résolu, mais pas encore d'ID choisi
    when: (stack: Frame[]) => {
      const actors = stack.find(f => f.entity === 'Actors')
      return !!actors && actors.state === 'RESOLVED' && actors.id == null
    },
    execute: async (stack: Frame[]) => {
      console.log('  ⭐ [selectActor] L\'utilisateur sélectionne un acteur...')
      const actors = stack.find(f => f.entity === 'Actors')
      if (actors) {
        actors.id = 3
        console.log('  ✓ Acteur #3 sélectionné')
      }
      return stack
    },
    cooldown: 0
  },

  {
    name: 'exploreFromActor',
    weight: 3,
    terminal: true, // S'exécute une seule fois
    when: (stack: Frame[]) => {
      const actors = stack.find(f => f.entity === 'Actors')
      return !!actors && actors.id != null
    },
    execute: async (stack: Frame[]) => {
      console.log('  🔍 [exploreFromActor] Affichage des options d\'exploration :')
      console.log('      - Filmographie complète')
      console.log('      - Autres réalisateurs')
      console.log('      - Co-stars')
      return stack
    },
    cooldown: 0
  }
]

export default actions
