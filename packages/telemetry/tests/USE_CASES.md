# LinkLab Telemetry — Use Cases Index

Ce dossier contient les **spécifications exécutables du système Telemetry**.

Chaque Use Case suit le pattern :

UC.md → description fonctionnelle  
UC.test.ts → implémentation exécutable

Les tests représentent **la validation contractuelle du comportement du composant**.

---

# Domain Map

Telemetry est composé de 4 sous-domaines :

Calibration
Drivers
Telemetry Core
Execution / Integration

---

# Calibration

## UC-C1 — CalibrationJob

Boucle d’auto-ajustement du système.

CalibrationJob analyse les traces stockées dans DuckDB pour recalibrer
les baselines de latence utilisées par MetricsCalculator.

Responsabilités :

- lire les percentiles DuckDB
- recalculer les baselines
- détecter les dérives
- émettre calibration:done

Composants :

CalibrationJob  
LatencyBaselineStore  
DuckDBDriver  
TraceBus

---

## UC-C2 — CalibrationBridge

Pont entre le moteur de télémétrie et les composants consommateurs
de calibrations (CLI, dashboards, agents externes).

Responsabilités :

- recevoir les événements calibration
- propager les baselines recalculées
- synchroniser les composants externes

---

# Drivers

## UC-D1 — DuckDBDriver

Driver d'accès à DuckDB utilisé pour :

- stocker les spans
- calculer les percentiles de latence
- fournir les statistiques pour la calibration

Responsabilités :

- ingestion des spans
- calcul des percentiles
- accès aux agrégats temporels

---

# Telemetry Core

## UC-T1 — TraceBus

Bus d'événements interne du moteur telemetry.

Responsabilités :

- propagation des événements telemetry
- découplage entre producteurs et consommateurs
- distribution des spans et métriques

---

## UC-T2 — SpanBuilder

Construit les spans à partir des événements de navigation.

Responsabilités :

- création des spans
- propagation du contexte de trace
- gestion des timestamps

---

## UC-T3 — LatencyBaseline

Stocke la baseline de latence pour chaque route.

Responsabilités :

- mémoriser les percentiles de référence
- fournir les baselines au MetricsCalculator

---

## UC-T4 — CapacityBaseline

Baseline de capacité du système.

Responsabilités :

- stocker la capacité nominale
- servir de référence pour le calcul de saturation

---

## UC-T5 — MetricsCalculator

Calcule les métriques de tension du système.

Responsabilités :

- calculer tension
- comparer latence réelle vs baseline
- produire les métriques d'observabilité

---

# Execution

## UC-T6 — BenchmarkRunner

Moteur d'exécution de benchmarks.

Responsabilités :

- exécuter des charges de test
- collecter les métriques
- produire les résultats d'analyse

---

## UC-T7 — GraphDriver

Driver reliant la télémétrie au moteur de navigation graph.

Responsabilités :

- capturer les événements de navigation
- convertir en spans telemetry

---

## UC-T8 — TelemetryService

Service principal orchestrant le pipeline telemetry.

Pipeline :

NavigationEngine
→ SpanBuilder
→ TraceBus
→ MetricsCalculator
→ CalibrationJob

---

# Integration

## UC-T9 — NavigationEngine + QueryEngine

Test d'intégration entre le moteur de navigation et le système
de télémétrie.

Objectif :

valider que la navigation produit correctement des spans
et que les métriques sont calculées correctement.

---

# Architecture Overview

NavigationEngine
│
▼
SpanBuilder
│
▼
TraceBus
│
▼
MetricsCalculator
│
▼
LatencyBaseline / CapacityBaseline
│
▼
CalibrationJob
│
▼
DuckDBDriver

---

# Use Case Conventions

Chaque UC doit contenir :

Objectif  
Entrées  
Traitement attendu  
Sorties  
Critères  
Cas de test

Les fichiers `.test.ts` doivent vérifier tous les critères.

---

# Philosophy

Les Use Cases sont la **source de vérité comportementale du système**.

Le code doit implémenter les comportements définis ici.

Tests = validation exécutable des Use Cases.
