/**
 * The names and texts of the mod, gathered so a test reads the same ones.
 */

/** The slash command, without its slash. */
export const COMMAND = 'switch'

/** The pane's id. */
export const PANE_ID = 'switch'

/** The pane's title. */
export const PANE_TITLE = 'Modèle et effort'

/** The key of a model's button. */
export const modelKey = (key: string): string => `model:${key}`

/** The key of an effort level's button. */
export const effortKey = (level: string): string => `effort:${level}`

/** What the person reads. */
export const TEXTS = {
  description: 'Panneau des modèles et des efforts, à changer d’un clic (/switch opus, /switch high)',
  models: 'Modèle',
  efforts: 'Effort',
  current: 'actuel',
  unknown: 'inconnu',
  noEffort: 'Ce modèle ne prend pas de réglage d’effort.',
  noEffortShort: 'sans effort',
  keys: '1–4 modèle · l m h x a effort',
  heldEffort: 'appliqué par le mod à chaque requête (pas de /effort ici)',
  coldCache: 'Changer vide le cache : la requête suivante se paie en entier.',
  opened: 'Panneau Modèle et effort ouvert.',
  unknownPick: 'Ni un modèle ni un effort :',
  modelSet: 'Modèle demandé :',
  effortSet: 'Effort demandé :',
  failed: 'Le changement n’a pas pris :',
} as const
