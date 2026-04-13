## Domain Concepts

expose config
GraphCompiler.compileNodes
node.exposed
linklabPlugin access control
buildRootLinks filtering

## Related Use Cases

UC-T3 — Trail query mode : CTE SQL global
ADR-0010 — expose : contrôle de l'exposition des entités

---

🎯 Objectif

Vérifier que la config `expose` dans `CompilerConfig` est correctement
compilée sur chaque node (`node.exposed`), et que `linklabPlugin` bloque
les Trails vers des entités non exposées avec un 404.

📥 Entrée

```typescript
// expose: 'none' — rien exposé
const compiler = new GraphCompiler({ expose: 'none' })

// expose: 'all' — tout exposé
const compiler = new GraphCompiler({ expose: 'all' })

// expose: { include } — liste blanche
const compiler = new GraphCompiler({ expose: { include: ['film', 'actor'] } })

// expose: { exclude } — liste noire
const compiler = new GraphCompiler({ expose: { exclude: ['staff', 'payment'] } })
```

📤 Sortie

```typescript
// expose: 'none'
compiled.nodes.every(n => n.exposed === false)  // true

// expose: 'all'
compiled.nodes.every(n => n.exposed === true)   // true

// expose: { include: ['film', 'actor'] }
compiled.nodes.find(n => n.id === 'film')?.exposed   // true
compiled.nodes.find(n => n.id === 'actor')?.exposed  // true
compiled.nodes.find(n => n.id === 'staff')?.exposed  // false

// linklabPlugin — entity non exposée
GET /api/staff → 404 NOT_FOUND
GET /api/film/1/staff → 404 NOT_FOUND (target not exposed)
```

📏 Critères

- `expose: 'none'` → tous les nodes ont `exposed: false`
- `expose: 'all'` → tous les nodes ont `exposed: true`
- `expose: { include }` → seuls les nodes listés ont `exposed: true`
- `expose: { exclude }` → tous sauf les exclus ont `exposed: true`
- Rétrocompatibilité : node sans flag `exposed` → considéré exposé
- Vues sémantiques bloquées si leur entité cible est `exposed: false`
- `buildRootLinks` ne liste que les nodes exposés

Cas de test

[E1.1] expose: 'none' → tous nodes exposed: false
[E1.2] expose: 'all' → tous nodes exposed: true
[E1.3] expose: { include } → seuls les nodes listés exposed: true
[E1.4] expose: { exclude } → tous sauf exclus exposed: true
[E1.5] node sans flag exposed → isExposed retourne true (rétrocompatibilité)
[E1.6] node exposed: false → isExposed retourne false
[E1.7] expose: 'none' → buildRootLinks retourne uniquement self
[E1.8] expose: { include: ['film'] } → buildRootLinks contient film, pas staff

---

## Architecture Context

```
CompilerConfig.expose
  ↓ GraphCompiler.compileNodes()
  ↓ node.exposed compilé dans {alias}.json
  ↓ linklabPlugin.isExposed()
  ↓ 404 si entité non exposée
  ↓ buildRootLinks filtre les non exposés
```

## Dependencies

- GraphCompiler
- CompiledGraph (nodes avec exposed)
- linklabPlugin (isExposed, buildRootLinks)
- types/index.ts (ExposeConfig, GraphNode.exposed)

## Failure Modes

- Node absent du graphe → isExposed retourne false
- expose config absente → défaut 'none' (sécurisé)
- Graphe ancien sans flag exposed → rétrocompatibilité assurée

## Observability Impact

- Trace 404 sur entité non exposée — visible dans les spans
- buildRootLinks épuré — surface d'API réduite et lisible
