/**
 * TrailRequest — Augmentation du type Request Fastify
 *
 * Ajoute `request.trail` et `request.linkBuilder`
 * sur chaque requête décorée par le plugin LinkLab.
 *
 * Usage :
 * ```typescript
 * fastify.get('/*', async (req, reply) => {
 *   const trail = req.trail         // Trail parsé depuis l'URL
 *   const links = req.linkBuilder   // LinkBuilder prêt à l'emploi
 * })
 * ```
 */
/**
 * Extracteur par défaut — lit req.user si présent (JWT/session)
 */
export const defaultUserExtractor = (req) => {
    const r = req;
    return r.user ?? r.session?.user ?? {};
};
//# sourceMappingURL=TrailRequest.js.map