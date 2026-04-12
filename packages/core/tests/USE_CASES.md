# Use Cases Index — @linklab/core

> Référence de tous les use cases de test.
> Lancer : `pnpm test` ou `pnpm test:coverage`

---

## Statut

| Groupe           | Fichier                  | UC             | Statut     |
| ---------------- | ------------------------ | -------------- | ---------- |
| PathFinder       | `pathfinder.test.ts`     | UC-P1 à UC-P10 | ✅ Écrit   |
| GraphCompiler    | `compiler.test.ts`       | UC-C1 à UC-C3  | ✅ Écrit   |
| QueryEngine      | `query-engine.test.ts`   | UC-Q1 à UC-Q3  | ✅ Écrit   |
| NavigationEngine | `navigation.test.ts`     | UC-N1 à UC-N2  | ✅ Écrit   |
| DomainProxy      | `domain/UC-D1-*.test.ts` | UC-D1          | ✅ Écrit   |
| Intégration      | `integration/*.test.ts`  | UC-I1 à UC-I4  | 📋 À faire |

---

## UC-P — PathFinder (Dijkstra + DFS)

| UC    | Description                | Cas testé                        |
| ----- | -------------------------- | -------------------------------- |
| P1    | Chemin le plus court       | Graphe linéaire, poids minimal   |
| P1.1  | Chemin direct              | A→B→C→D                          |
| P1.2  | Choisit le moins coûteux   | 2 chemins, poids différents      |
| P1.3  | Longueur 1                 | Nœuds adjacents                  |
| P1.4  | Nœud vers lui-même         | Poids 0                          |
| P2    | Chemin inexistant          | null, hasPath() = false          |
| P2.1  | Nœud isolé                 | C isolé dans A→B                 |
| P2.2  | Graphe vide                | hasPath() = false                |
| P2.3  | Graphe dirigé              | Pas de retour en sens inverse    |
| P3    | Chemin indirect            | Multi-sauts, chaîne sampling     |
| P3.1  | 4 sauts                    | Will Smith → Manu Dibango        |
| P3.2  | Dijkstra choisit direct    | James Brown → Kanye              |
| P4    | Plusieurs chemins          | findAllPaths, tri par poids      |
| P4.1  | Tri par poids              | Premier = moins cher             |
| P4.2  | maxPaths respecté          | Jamais plus que demandé          |
| P4.3  | Aucun chemin               | Retourne []                      |
| P5    | TransferPenalty            | Évite les correspondances        |
| P5.1  | Sans pénalité              | Chemin par poids brut            |
| P5.2  | Avec pénalité              | Évite les TRANSFER coûteux       |
| P6    | Via filter                 | Contraindre les types d'edges    |
| P6.1  | TYPE_X uniquement          | A→B→D (pas C)                    |
| P6.2  | TYPE_Y uniquement          | A→C→D (pas B)                    |
| P6.3  | Filtre impossible          | Retourne []                      |
| P6.4  | Chaîne sampling            | via [CREATED, SAMPLES, CREDITED] |
| P7    | MinHops                    | Forcer les chemins indirects     |
| P7.1  | minHops=0                  | Inclut le chemin direct          |
| P7.2  | minHops=1                  | Exclut le direct (length<3)      |
| P7.3  | minHops=2                  | Force 3+ intermédiaires          |
| P8    | Cycle detection            | Pas de boucle infinie            |
| P8.1  | Cycle simple               | A→B→C→A                          |
| P8.2  | Cycle bidirectionnel       | Daft Punk ↔ Kanye                |
| P8.3  | findAllPaths cyclique      | Chemins finis                    |
| P9    | Bidirectionnel             | Poids symétriques                |
| P9.1  | A→D et D→A                 | Même poids                       |
| P9.2  | Metro dirigé               | Retour peut être null            |
| P10   | Nœud isolé + cas limites   |                                  |
| P10.1 | getReachableNodes isolé    | Set vide                         |
| P10.2 | getReachableNodes connecté | Nœuds accessibles                |
| P10.3 | getStats                   | Métriques correctes              |
| P10.4 | Graphe vide                | Pas d'exception                  |

---

## UC-C — GraphCompiler (à implémenter)

| UC  | Description                             |
| --- | --------------------------------------- |
| C1  | Routes physiques compilées correctement |
| C2  | Routes sémantiques v2 avec condition    |
| C3  | Pas de doublons d'inverses (fix metro)  |

---

## UC-Q — QueryEngine (à implémenter)

| UC  | Description                                 |
| --- | ------------------------------------------- |
| Q1  | SQL généré correct (physical route)         |
| Q2  | executeInMemory retourne les bons résultats |
| Q3  | SQL sémantique avec condition jobId         |

---

## UC-N — NavigationEngine (à implémenter)

| UC  | Description                         |
| --- | ----------------------------------- |
| N1  | API fluente cinema.movies(5).people |
| N2  | Trail construit correctement        |

---

## UC-I — Intégration (à implémenter)

| UC  | Description                            | Dépendances          |
| --- | -------------------------------------- | -------------------- |
| I1  | Pipeline Netflix produit 76 routes     | compiled-graph.json  |
| I2  | QueryEngine sur graphe Netflix réel    | data/movies.json     |
| I3  | Metro Châtelet→Nation trouve un chemin | graph.json metro     |
| I4  | Musicians Will Smith → Manu Dibango    | graph.json musicians |

---

## Graphes minimalistes utilisés dans les tests

Ces graphes sont construits **en mémoire** dans les fichiers de test —
ils ne dépendent d'aucun fichier externe.

| Graphe           | Nœuds           | Edges | Usage                |
| ---------------- | --------------- | ----- | -------------------- |
| `LINEAR`         | A B C D         | 3     | Chemin simple        |
| `TWO_PATHS`      | A B C D         | 4     | Sélection optimal    |
| `METRO_MINI`     | S1 S2 S3 S4 HUB | 6     | TransferPenalty      |
| `CYCLIC`         | A B C           | 4     | Cycle detection      |
| `MUSICIANS_MINI` | 7 nœuds         | 9     | Cas réels simplifiés |
| `VIA_GRAPH`      | A B C D         | 4     | Via filter           |

---

## UC-C — GraphCompiler

| UC    | Description                               | Cas testés                          |
| ----- | ----------------------------------------- | ----------------------------------- |
| C1    | Routes physiques                          | C1.1→C1.10                          |
| C1.1  | Chemin compilé avec path et joins         | A→B→C → path=['A','B','C'], joins=2 |
| C1.2  | Choisit chemin poids minimal              | direct poids 5 vs indirect poids 2  |
| C1.3  | Paire non connectée absente               | nœud isolé absent de routes         |
| C1.4  | Edges SQL résolus                         | fromCol/toCol depuis edge.via       |
| C1.5  | Poids depuis métriques                    | metric.avgTime prioritaire          |
| C1.6  | Poids théorique sans métriques            | somme edge.weight                   |
| C1.7  | keepFallbacks=true                        | fallbacks présents                  |
| C1.8  | keepFallbacks=false                       | fallbacks=[]                        |
| C1.9  | Stats cohérentes                          | compiled + filtered = total         |
| C1.10 | weightThreshold filtre                    | route poids > threshold absente     |
| C2    | Routes sémantiques v2                     | C2.1→C2.5                           |
| C2.1  | semantic_view → RouteInfo semantic=true   | label='actor'                       |
| C2.2  | Condition injectée sur bon step           | edges[0].condition={jobId:1}        |
| C2.3  | Routes physique et sémantique coexistent  | même paire, 2 routes                |
| C2.4  | Route sémantique poids < physique         | weight 0.1 < 2                      |
| C2.5  | Sans semantic_view : 0 routes sémantiques | pas d'exception                     |
| C3    | Pas de doublons d'inverses                | C3.1→C3.4                           |
| C3.1  | Graphe unidir : inverses créés            | C→A navigable                       |
| C3.2  | Graphe bidir : pas de doublon             | clés physiques uniques              |
| C3.3  | Graphe mixte : inverse unidir seulement   | C→B créé, pas doublon A→B           |
| C3.4  | Routes identiques avant/après fix         | mêmes routes essentielles           |

---

## UC-Q — QueryEngine

| UC   | Description                                  | Cas testés                      |
| ---- | -------------------------------------------- | ------------------------------- |
| Q1   | generateSQL                                  | Q1.1→Q1.7                       |
| Q1.1 | 2 INNER JOIN corrects                        | movies→credits→people           |
| Q1.2 | 3 INNER JOIN corrects                        | departments→jobs→credits→movies |
| Q1.3 | Filtre numérique sans quotes                 | WHERE id = 278                  |
| Q1.4 | Filtre string avec quotes                    | WHERE name = 'Directing'        |
| Q1.5 | Sans filtre → pas de WHERE                   |                                 |
| Q1.6 | Plusieurs filtres → AND                      |                                 |
| Q1.7 | Route inexistante → Error                    |                                 |
| Q2   | executeInMemory                              | Q2.1→Q2.7                       |
| Q2.1 | 2 résultats pour film 278                    | Tim Robbins + Frank Darabont    |
| Q2.2 | 1 résultat pour film 680                     | John Travolta                   |
| Q2.3 | Sans filtre → tous accessibles               |                                 |
| Q2.4 | Filtre sans résultat → []                    |                                 |
| Q2.5 | 3 jointures en cascade                       | departments → movies            |
| Q2.6 | Table source manquante → Error               |                                 |
| Q2.7 | Table intermédiaire manquante → Error        |                                 |
| Q3   | SQL sémantique v2                            | Q3.1→Q3.7                       |
| Q3.1 | getRoute semantic='actor' → route sémantique |                                 |
| Q3.2 | getRoute sans semantic → route physique      |                                 |
| Q3.3 | generateSQL semantic → AND credits.jobId = 1 |                                 |
| Q3.4 | generateSQL sans semantic → pas de AND       |                                 |
| Q3.5 | executeInMemory semantic → acteurs seuls     | Tim Robbins only                |
| Q3.6 | executeInMemory sans semantic → tous         | Tim + Frank                     |
| Q3.7 | résultats semantic < résultats physique      |                                 |

---

## UC-N — NavigationEngine

| UC   | Description                       | Cas testés             |
| ---- | --------------------------------- | ---------------------- |
| N1   | Mode PATHFIND                     | N1.1→N1.8              |
| N1.1 | getMode() === 'PATHFIND'          |                        |
| N1.2 | Résultats triés par totalWeight   |                        |
| N1.3 | nodes[0]=from, nodes[last]=to     |                        |
| N1.4 | edges.length === nodes.length - 1 |                        |
| N1.5 | Aucun chemin → FAIL               |                        |
| N1.6 | maxPaths respecté                 |                        |
| N1.7 | via filter transmis à PathFinder  |                        |
| N1.8 | transferPenalty transmis          |                        |
| N2   | Mode NAVIGATE (Trail)             | N2.1→N2.7              |
| N2.1 | getMode() === 'NAVIGATE'          |                        |
| N2.2 | Frame UNRESOLVED → RESOLVED       |                        |
| N2.3 | resolvedBy renseigné              | relation, via, filters |
| N2.4 | Frame sans edge → DEFERRED        | pas d'exception        |
| N2.5 | getCurrentStack() reflète l'état  |                        |
| N2.6 | Phase COMPLETE quand tout résolu  |                        |
| N2.7 | maxSteps respecté                 |                        |

---

## UC-D — DomainProxy (navigation sémantique)

| UC    | Description                                                    | Cas testés                  |
| ----- | -------------------------------------------------------------- | --------------------------- |
| D1    | Résolution labels sémantiques depuis compiled.routes           | D1.1→D1.10                  |
| D1.1  | `directors('X').movies` → films jobId=2 uniquement             | Frank Darabont → 278 + 680  |
| D1.2  | `actors('X').movies` → films jobId=1 uniquement                | Tim Robbins → 278 seulement |
| D1.3  | `people('X').movies` → tous films (physique, pas de filtre)    |                             |
| D1.4  | résultats directors ⊆ résultats people (même personne)         |                             |
| D1.5  | résultats actors ⊆ résultats people (même personne)            |                             |
| D1.6  | `movies(278).actors` → Tim Robbins uniquement (jobId=1)        |                             |
| D1.7  | `movies(278).directors` → Frank Darabont uniquement (jobId=2)  |                             |
| D1.8  | `movies(278).people` → Tim + Frank (tous crédités)             |                             |
| D1.9  | sans compiledGraph → `directors` = undefined (pas d'exception) |                             |
| D1.10 | label inexistant → undefined silencieux (pas d'exception)      |                             |

**Répertoire :** `tests/domain/`
**Correction requise :** `DomainNode.resolveEntity()` — ajouter cas 4 :
chercher `label === prop` dans `compiled.routes` → `{ entity: r.to, semantic: r.label }`
