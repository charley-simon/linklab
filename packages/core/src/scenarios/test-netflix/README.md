# Scénario Netflix

Démonstration du **pipeline amont** de LinkLab sur des données JSON réelles.

Ce scénario est le seul qui illustre les deux côtés de LinkLab :

```
Pipeline amont   JsonSchemaExtractor → SchemaAnalyzer → GraphBuilder
                 → GraphAssembler → GraphOptimizer → graph.json

Pipeline aval    PathFinder → NavigationEngine → résultats
```

Le `graph.json` de ce scénario **n'est pas écrit à la main** — il est généré
automatiquement depuis les 8 fichiers JSON dans `data/`.

---

## Structure des données

```
data/
  categories.json    18 entrées   id, name
  companies.json     vide
  credits.json       2 957 entrées  id, movieId, personId, jobId
  departments.json   4 entrées    id, name
  jobs.json          28 entrées   id, name, departmentId
  movies.json        200 entrées  id, title, categories[], releaseYear, ...
  people.json        2 363 entrées  id, gender, name
  users.json         5 entrées    id, name, isAdmin, preferences{}
  synonyms.json      synonymes projet (person→people, movie→movies, ...)
```

### Relations FK détectées automatiquement

| Colonne | Résolution | Stratégie |
|---------|------------|-----------|
| `credits.movieId` | → `movies.id` | pluriel régulier +s |
| `credits.personId` | → `people.id` | synonyme universel (person→people) |
| `credits.jobId` | → `jobs.id` | synonyme projet (job→jobs) |
| `jobs.departmentId` | → `departments.id` | correspondance directe |

---

## Graphe généré

```
7 nœuds   movies, people, credits, jobs, departments, categories, users
66 arêtes
  physical         × 4   FK déclarées
  physical_reverse × 4   inverses automatiques
  semantic_view    × 56  movies ↔ people pour chacun des 28 jobs
  virtual          × 2   movies ↔ categories (array inline)
```

### Pourquoi 56 vues sémantiques ?

`credits` est un pivot entre `movies` et `people` avec un discriminant `jobId → jobs`.
Le `GraphBuilder` lit la table `jobs` (28 entrées) et génère automatiquement une
paire d'arêtes sémantiques par job :

```
movies → people  [actor]          condition: { jobId: 1 }
people → movies  [actor_in]       condition: { jobId: 1 }
movies → people  [director]       condition: { jobId: 2 }
people → movies  [director_in]    condition: { jobId: 2 }
movies → people  [writer]         condition: { jobId: 3 }
...
```

Sans le pipeline, ces 56 relations devraient être écrites à la main.

---

## Lancer le scénario

```bash
# Requête par défaut (directors-of-movie)
tsx cli/run-scenario.ts scenarios/test-netflix

# Requêtes disponibles
tsx cli/run-scenario.ts scenarios/test-netflix --query actors-of-movie
tsx cli/run-scenario.ts scenarios/test-netflix --query movies-of-director
tsx cli/run-scenario.ts scenarios/test-netflix --query movies-to-departments
tsx cli/run-scenario.ts scenarios/test-netflix --query people-to-movies-minhops
tsx cli/run-scenario.ts scenarios/test-netflix --query all
```

### Requêtes disponibles

| Nom | Description |
|-----|-------------|
| `directors-of-movie` | movies → people via vue `director` |
| `actors-of-movie` | movies → people via vue `actor` |
| `movies-of-director` | people → movies via vue `director_in` |
| `movies-of-actor` | people → movies via vue `actor_in` |
| `credits-to-jobs` | navigation physique credits → jobs |
| `jobs-to-departments` | navigation physique jobs → departments |
| `movies-to-categories` | relation virtuelle (array inline) |
| `movies-to-departments` | 2 sauts : movies → credits → jobs → departments |
| `people-to-departments` | 3 sauts via credits → jobs → departments |
| `people-to-movies-minhops` | chemin le plus court avec `minHops` |

---

## Régénérer le graphe

Si tu modifies les données, relance le pipeline pour régénérer `graph.json` :

```bash
tsx cli/run-pipeline.ts scenarios/test-netflix/data --out scenarios/test-netflix/graph.json
```

Le pipeline utilise `data/synonyms.json` pour résoudre les FK irrégulières
(`personId → people`, `jobId → jobs`) en complément de `config/synonyms.json`
(synonymes universels).

---

## Ce que ce scénario ne couvre pas

| Donnée | Raison |
|--------|--------|
| `movies.categories` (array inline) | Relation virtuelle générée, mais sans garantie de correspondance exacte des ids |
| `users.preferences` (objet imbriqué) | Pas de FK — structure non relationnelle |
| `people/` et `movies/` (sous-dossiers détail) | Fichiers enrichis pour l'application — hors scope du pipeline |
| `companies.json` (vide) | Ignoré automatiquement |

---

## Comparaison avec les autres scénarios

| Scénario | Source | Ce qu'il démontre |
|----------|--------|-------------------|
| **Netflix** | JSON → pipeline | pipeline amont + vues sémantiques auto-générées |
| Musiciens | graph manuel | PATHFIND, `via`, `minHops`, cycles |
| Métro Paris | graph manuel | Dijkstra, poids, transferPenalty |
| DVDRental | PostgreSQL → pipeline | FK implicites, SchemaExtractor SQL |
