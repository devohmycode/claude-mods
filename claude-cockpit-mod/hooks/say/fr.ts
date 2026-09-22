/**
 * Le cockpit en français.
 *
 * Un fichier de langue donne les clés qu'il traduit et pas d'autres : il est
 * typé `PartialTexts`, donc ce qu'il laisse de côté retombe sur l'anglais
 * ligne par ligne, et une clé mal orthographiée est une erreur de
 * compilation plutôt qu'un blanc à l'écran.
 *
 * Les identifiants ne se traduisent pas — ni le nom des onglets dans
 * `/cockpit <tab>` et `hideTabs`, ni celui de la commande — parce qu'ils se
 * tapent. Seuls les titres du rail changent, ce qui est dit là où cela se
 * lit : le rail affiche `Session`, la commande prend toujours `session`.
 */

import type { PartialTexts } from './en'

/**
 * Français.
 */
export const FR: PartialTexts = {
  pane: {
    noTabs: 'Aucun onglet enregistré.',
    emptyFiles: 'Aucun fichier lu ni écrit pour l’instant.',
    emptyTools: 'Aucun outil appelé pour l’instant.',
    emptyAgents: 'Aucun sous-agent lancé cette session.',
    agentCount: (all, running) =>
      `${all} sous-agent${all === 1 ? '' : 's'} cette session${running > 0 ? ` · ${running} en cours` : ''}`,
    emptyHistory: 'Aucun tour terminé pour l’instant.',
    limits: 'Fenêtres du forfait',
    host: took => `Machine · lue en ${took}`,
    hostOn:
      'Lecture de la machine activée : le processeur, la mémoire et la carte graphique, toutes les cinq secondes tant que l’onglet Session est ouvert.',
    hostOff: 'Lecture de la machine désactivée.',
    hostNone:
      'Cet hôte n’a répondu à aucune des commandes par lesquelles le cockpit lit une machine.',
    resets: left => `remise à zéro dans ${left}`,
    showMore: hidden => `Afficher la suite (${hidden})`,
    showLess: 'Replier',
    read: 'lu',
    written: 'écrit',
    ok: 'ok',
    failed: 'échec',
    band: isOpen => (isOpen ? 'Fermer' : 'Cockpit'),
    opened: 'Cockpit ouvert.',
    closed: 'Cockpit fermé.',
    dismissed: 'Cockpit refermé.',
    unknownTab: (id, known) =>
      `Aucun onglet nommé ${id}. Connus : ${known.join(', ')}.`,
    armed: (path, armed) =>
      armed === 1
        ? `${path} partira avec le prochain message.`
        : `${path} partira avec le prochain message, et ${armed - 1} autre${armed === 2 ? '' : 's'}.`,
    sent: paths =>
      paths.length === 1
        ? `${paths[0]} est parti avec le message.`
        : `${paths.length} fichiers sont partis avec le message.`,
    footer: 'tab : onglet suivant · entrée : y entrer · échap : retour au prompt',
    command:
      'Le volet cockpit : la session, ce qu’elle a coûté, les fichiers, les outils, les sous-agents et le relevé de la machine, côte à côte à côté du transcript',
  },

  titles: {
    session: 'Session',
    usage: 'Coûts',
    stats: 'Relevé',
    files: 'Fichiers',
    tools: 'Outils',
    agents: 'Agents',
  },

  usage: {
    session: 'Cette session',
    cost: 'Coût',
    wall: 'Temps de tour',
    turns: 'Tours',
    lines: 'Lignes',
    tokens: 'Tokens',
    main: 'Boucle principale',
    agents: 'Sous-agents',
    total: 'Total',
    columns: ['entrée', 'sortie', 'cache l', 'cache é'],
    noTurns: 'Aucun tour terminé n’a encore rapporté ses tokens.',
    share: percent => `Les sous-agents ont écrit ${percent} de la sortie.`,
    underAgents: turns => `dont ${turns} en sous-agents`,
    skills: 'Listes de skills dans le prompt système',
    skillsNote: 'Estimé en local, par tour où le prompt est envoyé.',
    noSkills: 'Cette session ne liste aucun skill.',
    skillCount: skills => `${skills} skill${skills === 1 ? '' : 's'}`,
  },

  stats: {
    title: 'Messages envoyés depuis cette machine',
    source: 'D’après ~/.claude/history.jsonl',
    reading: 'Lecture de l’historique…',
    none: 'Aucun fichier d’historique sur cette machine.',
    ranges: {
      all: 'Depuis toujours',
      d30: '30 derniers jours',
      d7: '7 derniers jours',
    },
    prompts: 'Messages',
    sessions: 'Sessions',
    projects: 'Projets',
    activeDays: 'Jours actifs',
    busiest: 'Jour le plus chargé',
    topProject: 'Projet dominant',
    currentStreak: 'Série en cours',
    longestStreak: 'Plus longue série',
    legend: 'Moins',
    legendMore: 'Plus',
    days: days => `${days} jour${days === 1 ? '' : 's'}`,
    since: date => `depuis le ${date}`,
  },

  rail: {
    label: 'Onglets que le cockpit laisse de côté',
    help: (shown, hidden) =>
      `Identifiants à retirer, séparés par des virgules ; vide les affiche tous. Enregistrés à l’instant : ${
        [...shown, ...hidden].join(', ') || 'aucun'
      }.${hidden.length === 0 ? '' : ` Retirés : ${hidden.join(', ')}.`}`,
    unknown: (bad, known) =>
      `Aucun onglet nommé ${bad.join(', ')}. Connus : ${known.join(', ')}.`,
    hidden: (title, label) =>
      `${title} est masqué. /config → ${label} le fait revenir.`,
    none: 'Tous les onglets sont masqués. /config les fait revenir.',
  },
}
