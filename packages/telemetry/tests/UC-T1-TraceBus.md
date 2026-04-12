🎯 Objectif
Valider le bus central de télémétrie : émission typée, souscription,
désouscription, multi-listeners, et comptage des abonnés.

Le TraceBus est le seul point de couplage entre @linklab/core et
@linklab/telemetry. Il doit être fiable, léger, et ne jamais lever
d'exception sur un événement sans listener.

📥 Entrée
API testée :
  traceBus.emit(event, payload)    → boolean
  traceBus.on(event, listener)     → TraceBus
  traceBus.once(event, listener)   → TraceBus
  traceBus.off(event, listener)    → TraceBus
  traceBus.listenerCounts()        → Record<string, number>

Événements disponibles :
  'span:start'      payload: Span
  'span:end'        payload: Span
  'span:error'      payload: Span (avec .error défini)
  'metrics:update'  payload: SystemMetrics
  'yoyo:detected'   payload: { entity, route, timestamp }

⚙️ Traitement attendu
Émission :
  - emit retourne true si au moins un listener est abonné
  - emit retourne false si aucun listener
  - Le payload est transmis tel quel, sans copie ni transformation

Souscription :
  - on()   → listener appelé à chaque émission
  - once() → listener appelé exactement 1 fois, puis retiré automatiquement
  - off()  → listener retiré, plus jamais appelé après

Multi-listeners :
  - Plusieurs listeners sur le même event → tous appelés dans l'ordre d'inscription
  - Listener sur event A n'est pas appelé pour event B

listenerCounts :
  - Retourne le nombre de listeners actifs par type d'événement
  - Compte exact après on/off/once

📤 Sortie
Aucune sortie disque — bus in-memory pur.

📏 Critères
- emit sans listener → false, pas d'erreur levée
- emit avec 1 listener → true, listener appelé avec le bon payload
- on() → appelé N fois pour N émissions
- once() → appelé exactement 1 fois
- off() → listener silencieux après désouscription
- Multi-listeners → tous appelés
- Isolation events → listener A pas notifié par event B
- listenerCounts() → compte correct après mutations

Cas de test
  [bus-1]  emit sans listener                    → false, pas d'erreur
  [bus-2]  on + emit                             → listener reçoit le payload
  [bus-3]  on + emit × 3                         → listener appelé 3 fois
  [bus-4]  once + emit × 3                       → listener appelé 1 seule fois
  [bus-5]  off + emit                            → listener silencieux
  [bus-6]  2 listeners sur le même event         → les deux appelés
  [bus-7]  listener span:end pas notifié pour metrics:update → isolation
  [bus-8]  listenerCounts() après on()           → count = 1
  [bus-9]  listenerCounts() après off()          → count = 0
  [bus-10] payload transmis sans mutation        → deepEqual avec l'original

Notes
- Le bus est un singleton — les tests doivent nettoyer leurs listeners
  via off() ou once() pour éviter les interférences entre tests.
- Ne pas tester le comportement EventEmitter natif (maxListeners, error event) —
  ce sont des détails d'implémentation, pas du comportement observable.
