/**
 * test-domain.ts — Validation niveau 1 : DomainProxy
 *
 * Couvre :
 *   - Accès propriété simple       cinema.movies
 *   - Filtre par ID (number)       cinema.people(278)
 *   - Filtre par objet             cinema.people({ id: 278 })
 *   - Traversée thenable           await cinema.people(278).movies
 *   - Fetch direct                 await cinema.movies
 *   - Chaînage profond             await cinema.people(278).movies (depth 2)
 */
export {};
//# sourceMappingURL=test-domain.d.ts.map