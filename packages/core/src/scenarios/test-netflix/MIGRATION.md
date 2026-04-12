# Migration depuis l'ancien scénario Netflix

## Fichiers supprimés

| Fichier | Raison |
|---------|--------|
| `actions.ts` | Mode SCHEDULE mis de côté — remplacé par `queries.ts` |
| `stack.json` | Pile pré-chargée pour SCHEDULE — plus pertinente |

## Fichiers remplacés

| Ancien | Nouveau | Changement |
|--------|---------|------------|
| `config.json` mode `SCHEDULE` | `config.json` mode `NAVIGATE` | Abandon de SCHEDULE |
| `graph.json` conceptuel (Directors/Actors/Genres) | `graph.json` généré par pipeline | Remplacement complet |

## Fichiers ajoutés

| Fichier | Description |
|---------|-------------|
| `data/` | 8 fichiers JSON + synonyms.json |
| `queries.ts` | 10 requêtes NAVIGATE/PATHFIND |
| `README.md` | Documentation complète |
