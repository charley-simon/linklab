1. packages/linklab-http/README.md
   Ce document présente le bridge entre le moteur LinkLab et le monde Web via Fastify.

Markdown

# @linklab/http

Ce package fournit l'intégration HTTP officielle pour LinkLab, permettant d'exposer un graphe sémantique sous forme d'API **HATEOAS** automatisée.

## Installation

```bash
pnpm add @linklab/http
```

Usage (Fastify Plugin)
Le plugin linklabPlugin transforme vos définitions de graphes en routes API prêtes à l'emploi.

```typeScript
import Fastify from 'fastify'
import { linklabPlugin } from '@linklab/http'

const fastify = Fastify()

await fastify.register(linklabPlugin, {
  graph: semanticGraph,         // Le graphe logique (noeuds/arêtes)
  compiledGraph: compiledGraph, // Le graphe compilé pour la navigation
  prefix: '/api',               // Préfixe de l'API
  dataLoader: {
    dataset: { movies, people, credits, ... }
  }
})

fastify.listen({ port: 3000 })
```

## 1. Fonctionnalités

- HATEOAS Automatique : Injection de l'objet \_links dans chaque réponse.
- Navigation Récursive : Support des chemins complexes (ex: /movies/278/credits/people).
- Découvrabilité : Navigation fluide de parent à enfant (self, up, et relations nommées).
- Instrumentation : Compatible avec @linklab/telemetry pour le monitoring de la tension API.

---

## 2. docs/architecture/hateoas.md

Ce document détaille la logique de navigation par liens hypermédias.

````markdown
# Architecture HATEOAS dans LinkLab

L'implémentation HATEOAS (_Hypermedia as the Engine of Application State_) de LinkLab repose sur la structure du graphe sémantique pour générer dynamiquement des liens de navigation.

## Concept de Navigation

Contrairement aux API REST classiques où les URLs sont codées en dur, LinkLab utilise les arêtes (edges) du graphe pour déterminer les transitions d'état possibles.

### Structure d'une Réponse

Chaque entité renvoyée par le `linklabPlugin` est enrichie d'un bloc `_links` :

- **self** : L'URL unique de la ressource actuelle.
- **up** : Le lien vers la collection parente (nœud précédent dans la hiérarchie).
- **Relations** : Liens vers les nœuds adjacents définis dans le graphe (ex: `credits`, `categories`, `people`).

### Exemple de Payload

Pour une requête sur `/api/movies/278` :

```json
{
  "id": 278,
  "title": "The Shawshank Redemption",
  "_links": {
    "self": { "href": "/api/movies/278", "method": "GET" },
    "up": { "href": "/api/movies", "title": "Collection movies" },
    "credits": { "href": "/api/movies/278/credits", "title": "LIST_OF_CREDITS" },
    "people": { "href": "/api/movies/278/people", "title": "actor" }
  }
}
```
````

## 3. Résolution des Chemins

Le NavigationEngine de LinkLab est sollicité à chaque requête pour valider que le chemin demandé existe dans le graphe compilé avant de déléguer l'extraction des données au QueryEngine.
