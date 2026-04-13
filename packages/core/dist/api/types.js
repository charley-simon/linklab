/**
 * api/types.ts — Types publics de l'API LinkLab niveau 2+
 *
 * Ces types sont la surface visible pour les utilisateurs du moteur.
 * Les types internes (CompiledGraph, RouteInfo, etc.) restent dans types/index.ts.
 */
// Factories — évitent les objets littéraux à l'usage
export const Strategy = {
    Shortest: () => ({ type: 'Shortest' }),
    Comfort: () => ({ type: 'Comfort' }),
    LeastHops: () => ({ type: 'LeastHops' }),
    Custom: (transferPenalty) => ({ type: 'Custom', transferPenalty }),
    toPenalty(s) {
        switch (s.type) {
            case 'Shortest': return 0;
            case 'Comfort': return 8;
            case 'LeastHops': return 50;
            case 'Custom': return s.transferPenalty;
        }
    }
};
//# sourceMappingURL=types.js.map