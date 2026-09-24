/**
 * ContextManager en français.
 *
 * Un fichier de langue donne les clés qu’il traduit et pas d’autres : il est typé
 * `PartialTexts`, donc ce qu’il laisse de côté retombe sur l’anglais ligne par
 * ligne, et une clé mal orthographiée est une erreur de compilation plutôt qu’un
 * blanc à l’écran.
 *
 * Ce qui se tape ne se traduit pas : ni le nom de la commande, ni ses
 * sous-commandes (`check`, `fix`, `ignore`, `debug`, `reset`), ni les identifiants
 * que le modèle et le magasin se renvoient — catégories dans un `id`, poignées de
 * preuve, signatures. Seul change ce qui se lit.
 */

import type { PartialTexts } from './en'

/** « 2 tours », « 1 tour » : le compte et le mot qu’il prend. */
const compte = (n: number, mot: string, pluriel = `${mot}s`): string => `${n} ${n === 1 ? mot : pluriel}`

/**
 * Français.
 */
export const FR: PartialTexts = {
  pane: {
    awaiting: 'en attente du premier tour',
    contextUsed: share => `${share} du contexte`,
    toCompaction: tokens => `${tokens} tokens avant compactage`,
    toCompactionShort: tokens => `${tokens} avant compactage`,
    turnsLeft: turns => `environ ${compte(turns, 'tour')}`,

    judge: 'Audit ',
    judgeRuns: runs => compte(runs, 'passage'),
    judgeTokens: amount => `${amount} tokens`,
    auditCost: part => `audit ${part} % des tokens de la session`,

    saved: 'Gagné ',
    checkNow: 'Analyser',
    checking: 'Analyse…',
    checkingLong: 'analyse de la session… 10–20 s en général',

    time: 'Temps',
    context: 'Contexte',
    timeLead: 'dans les outils',
    session: 'Session',
    machine: 'Information',
    repo: 'Repo',
    infoEffort: effort => `effort ${effort}`,
    infoPercent: part => `${part} %`,
    infoSkill: skill => `skill ${skill}`,
    infoCpu: part => `CPU ${part} %`,
    infoRam: part => `RAM ${part} %`,
    prefix: 'Préfixe',
    prefixLead: 'tokens à chaque requête',
    compaction: 'Compactage',
    compactedAt: tour => `au tour ${tour}`,
    share: (poste, part) => `${poste} ${part} %`,
    sinkNames: {
      tests: 'tests', git: 'git', builds: 'builds', installs: 'installations', searches: 'recherches', reads: 'lectures',
      commands: 'commandes', edits: 'éditions', agents: 'agents',
    },
    contextLead: 'via les outils',
    nothingYet: 'rien ne ressort encore',

    empty: 'Sous surveillance. Rien ne se répète pour l’instant.',

    fix: 'Corriger',
    fixNote: 'Corriger…',
    ignore: 'Ignorer',
    info: 'i',

    hits: times => `${times}×`,
    costShare: percent => `~${percent}% du contexte`,
    turnAt: turn => `tour ${turn}`,
    turnRange: (first, last) => `tours ${first}–${last}`,
    // L’anglais dit « ignored » des deux côtés : la carte qu’on écarte et l’instruction que Claude
    // n’a pas suivie. Le français les sépare, parce qu’il doit de toute façon choisir un genre, et
    // qu’une carte revenue parce que l’instruction est restée lettre morte ne se lit pas comme une
    // carte que l’on vient d’écarter soi-même.
    ignored: kind => `non suivie · ${kind}`,

    why: 'motif',
    fixLabel: 'correctif',
    callCount: calls => compte(calls, 'appel'),
    turnCount: turns => compte(turns, 'tour'),
    agentCount: agents => compte(agents, 'agent'),
    perTurn: tokens => `~${tokens} tokens par tour`,
    charsOfContext: chars => `${chars} caractères de contexte`,

    turnCell: turn => `tour ${turn}`,
    charsUnit: ' car',
    answerSize: chars => `${chars} de réponse`,
    loop: 'agent',
    loopCost: (ktokens, edits) => `${ktokens}k tokens · ${compte(edits, 'édition')}`,

    steerHint: 'Entrée envoie · Corriger… referme · ou /manager fix <n> <texte>',
    send: 'envoyer',

    decided: 'Décidé',
    decidedWord: { keep: 'ignoré', steer: 'corrigé avec une note', kill: 'corrigé' },
    savedCredit: percent => `~${percent}% gagnés`,
    perRepeat: percent => `~${percent}% par répétition`,
    ignoredTimes: times => `non suivie ${times}×`,

    rules: 'Règles pour la prochaine session',
    artifact: {
      'claude-md': 'CLAUDE.md',
      skill: 'skill',
      'agent-brief': 'brief d’agent',
      'settings-allow': 'règle de permission',
    },
    write: 'Écrire',
    tryOnce: 'Essayer',
    skip: 'Passer',
    previewConfirm: 'Écrire de nouveau pour écrire',
    previewDuplicate: 'déjà dans le fichier — rien à écrire',
    previewOverwrites: 'remplace le fichier existant',
    staleTitle: 'Règles restées sans effet',
    staleWhy: sessions => `son comportement n’est jamais revenu en ${compte(sessions, 'session')}, et n’était qu’occasionnel avant`,
    remove: 'Retirer',
    keepIt: 'Garder',
    apply: 'Appliquer',

    decidedCount: decided => `Décidé ${decided}`,
    rulesCount: rules => `Règles ${rules}`,
    fullPane: '/manager pour le panneau complet',

    verbsHint: '/manager fix|ignore <n>',
    keysFocus: 'ctrl+x tab donne le clavier à ce panneau',
    keysMove: 'Tab circule',
    keysPress: 'Entrée valide',
    keysBack: 'Échap rend le clavier',
  },

  band: {
    died: how => `Dernier tour terminé sur ${how}`,
    diedError: 'une erreur API',
    diedRefusal: 'un refus',
    diedContinue: 'tapez n’importe quoi pour continuer',

    checking: 'analyse de la session…',

    foundWorthLook: cards => `${compte(cards, 'chose')} à regarder`,
    foundSavingBoth: (cards, share, time) => `${compte(cards, 'moyen')} d’économiser ${share} et ${time}`,
    foundSaving: (cards, saving) => `${compte(cards, 'moyen')} d’économiser ${saving}`,
    foundShort: cards => `${compte(cards, 'gaspillage')} repéré${cards === 1 ? '' : 's'}`,
    costShare: percent => `${percent >= 1 ? `~${Math.round(percent)}%` : 'moins de 1%'} de votre contexte`,

    saved: 'gagné ',
    ofContext: ' de contexte',
    thisSession: ' cette session',

    running: 'en cours',
    agentCount: agents => compte(agents, 'agent'),
    callCount: calls => compte(calls, 'appel'),

    watching: 'en veille',
    watched: calls => `${compte(calls, 'appel')} surveillé${calls === 1 ? '' : 's'}`,
    quiet: 'rien de gaspillé pour l’instant',
    slowed: 'audit ralenti : les derniers passages n’ont rien trouvé',

    open: 'Ouvrir',
    close: 'Fermer',
  },

  command: {
    description: 'ContextManager : afficher ou masquer le panneau · check | fix [n] [texte] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset',
    argumentHint: '[check | fix [n] [texte] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]',

    usage: 'Utilisation : /manager [check | fix [n] [texte] | ignore <n> | apply <n> | report | stats | unmute <id> | debug | reset]',
    fixUsage: 'Utilisation : /manager fix [n] [instruction] (un nombre en tête désigne la carte que le panneau numérote ; sans nombre : la carte dont le champ Corriger… est ouvert, sinon la carte 1)',
    paneShown: 'Panneau ContextManager affiché',
    paneHidden: 'Panneau ContextManager masqué',
    nothingToDecide: 'ContextManager : rien à décider',
    reset: 'ContextManager : état de la session réinitialisé',
    demoLoaded: 'ContextManager : gaspillages de démonstration chargés',

    checking: 'ContextManager : analyse de la session à la recherche de gaspillages…',
    alreadyChecking: 'ContextManager : analyse déjà en cours',
    nothingNew: 'ContextManager : rien de nouveau',
    found: cards => `ContextManager : ${cards} ${cards === 1 ? 'nouveau gaspillage' : 'nouveaux gaspillages'}`,
    checkFailed: failure => `ContextManager : analyse échouée — ${failure}`,
    notCheckedYet: failure => `ContextManager : analyse impossible pour l’instant — ${failure}`,

    card: (seat, kind, outcome) => `ContextManager : carte ${seat} — « ${kind} » · ${outcome}`,
    noCard: (seat, cards) => `ContextManager : pas de carte ${seat} (1–${cards})`,
    outcomeIgnored: 'ignorée',
    outcomeFixed: 'corrigée',
    outcomeNoted: text => `corrigée avec votre note : ${text}`,

    toastIgnored: kind => `ContextManager : « ${kind} » ignoré`,
    toastFixed: alternative => `ContextManager : corrigé — ${alternative}`,
    toastNoted: instruction => `ContextManager : corrigé avec votre note — ${instruction}`,
    writeFirst: 'ContextManager : écrivez d’abord l’instruction',

    savedToast: figures => `${figures} de contexte gagné`,

    wrote: path => `${path} écrit`,
    trying: title => `« ${title} » essayé pour cette session`,

    composerHasKeys: seat => `ContextManager : le compositeur a votre clavier — tapez /manager fix ${seat} <votre note>`,

    statsEmpty: sessions => `ContextManager : rien d’enregistré dans ce projet pour l’instant (${compte(sessions, 'session')})`,
    statsHeader: sessions => `ContextManager — ce projet, ${compte(sessions, 'session')} :`,
    statsLine: r => {
      const gagne = [r.savedTime, r.savedChars === null ? null : `${r.savedChars} caractères`].filter((x): x is string => x !== null)
      const marques = [r.byCode ? 'trouvé par le code' : null, r.muted ? 'en sourdine' : null].filter((x): x is string => x !== null)
      return `- ${r.kind} — ${r.seen}× en ${compte(r.sessions, 'session')} · corrigé ${r.fixed} · ignoré ${r.ignored}${gagne.length === 0 ? '' : ` · gagné ${gagne.join(' · ')}`}${marques.length === 0 ? '' : ` [${marques.join(', ')}]`}`
    },
    appliedNote: (original, reecrit, suite) => `[ContextManager] lancé \`${reecrit}\` au lieu de \`${original}\`, à la demande de l’utilisateur — ${suite}`,
    appliedSuiteAfter: 'relance la commande d’origine pour avoir toute la suite.',
    appliedLogAfter: 'lis le fichier lui-même pour le reste.',
    appliedOn: kind => `ContextManager : appliqué — les prochains appels sont réécrits : ${kind}`,
    appliedStopped: kind => `ContextManager : Appliquer arrêté — Claude a relancé l’original deux fois juste après une réécriture : ${kind}`,
    applyOff: 'ContextManager : Appliquer est désactivé — activez la ligne apply dans /config',
    notApplicable: siege => `ContextManager : la carte ${siege} n’a pas de réécriture ; utilisez /manager fix ${siege}`,
    reportTitle: date => `ContextManager — rapport de session, ${date} UTC`,
    reportFacts: (tours, appels, compactages) => `${compte(tours, 'tour')} · ${compte(appels, 'appel d’outil', 'appels d’outils')} · ${compte(compactages, 'compactage')}`,
    reportFound: 'Ce qui s’est répété',
    reportNothing: 'Rien.',
    reportUndecided: 'non décidé',
    reportByCode: 'trouvé par le code',
    reportByJudge: 'trouvé par l’audit',
    reportSaved: 'Ce que les décisions ont fait gagner',
    reportSavedTime: temps => `temps : ${temps}`,
    reportSavedContext: (chars, part) => `contexte : ${chars} caractères (~${part} % de la fenêtre)`,
    reportAudit: 'Ce que l’audit a coûté',
    reportAuditLine: (passages, tokens, part) => `${compte(passages, 'passage')} · ${tokens} tokens${part === null ? '' : ` (${part} % des nouveaux tokens de la session)`}`,
    reportContext: 'Où est parti le contexte',
    reportWritten: path => `ContextManager : rapport écrit dans ${path}`,
    alreadyThere: path => `ContextManager : ${path} le dit déjà — rien d’écrit`,
    removed: path => `ContextManager : règle retirée de ${path}`,
    compacted: (tour, parts) => `ContextManager : compactage au tour ${tour} — ${parts}`,
    statsMore: rows => `… et ${compte(rows, 'autre comportement', 'autres comportements')}`,
    statsAudit: (runs, tokens) => `Audit : ${compte(runs, 'passage')} · ${tokens} tokens`,
    historyUnavailable: 'ContextManager : pas de dossier personnel où garder l’historique de ce projet',

    unmuteUsage: 'Utilisation : /manager unmute <id du motif> (les id que /manager debug liste en sourdine)',
    unmuted: id => `ContextManager : ${id} sera de nouveau signalé dans ce projet`,
    notMuted: id => `ContextManager : ${id} n’est pas en sourdine dans ce projet`,
  },

  categories: {
    execution: 'exécution',
    reading: 'lecture',
    production: 'production',
    behavior: 'comportement',
    communication: 'communication',
    'multi-agent': 'multi-agents',
    environment: 'environnement',
    process: 'processus',
    other: 'autre',
  },

  judge: {
    // Écrit en anglais à dessein : c’est un paragraphe ajouté à la fin d’un prompt
    // anglais, lu par le modèle et par personne d’autre. Une consigne rédigée dans
    // la langue du prompt qui l’entoure est celle qui est suivie le plus sûrement ;
    // ce qu’elle demande, en revanche, est bien du français.
    directive: `## Language — write the reply's prose in French
The rules and the blocks above are in English because that is this prompt's language; your reply's prose is not. Write \`kind\`, \`why\`, \`alternative\`, \`time\`, \`context\` and any \`proposal\` \`title\` and \`body\` in French, in the plain words of the work, and keep the brevity the caps ask for — they count characters, not words. \`kind\` starts exactly with \`Claude continue de \` in place of \`Claude keeps \`: the examples above show the English opening because they were written for it.
Everything a machine matches is never translated and stays exactly as specified above: the JSON keys, the \`id\` and its kebab slug, the nine \`category\` names, the evidence handles (\`r12\`, \`turn:7\`, \`agent:a3\`), the \`signature\` \`tool\` and \`key\` copied character-for-character from a LEDGER row, and the \`proposal\` \`kind\`. A translated one discards the finding whole.`,
    kindPrefix: 'Claude continue de ',
    instruction: text => `Instruction de l’utilisateur (via ContextManager) : ${text}`,
    kill: (kind, alternative) => `Arrête ce comportement pour le reste de la session : ${kind}. À partir de maintenant : ${alternative}`,
  },

  detect: {
    rereadKind: path => `Claude continue de relire ${path} sans que rien ne l’ait changé entre-temps`,
    rereadWhy: fois => `Lu ${compte(fois, 'fois', 'fois')}, sans édition, installation ni formateur qui ait pu changer le fichier entre deux lectures.`,
    rereadFix: path => `Travaille avec ce que tu as déjà lu de ${path} ; relis-le seulement après un changement, et alors seulement les lignes utiles.`,
    fullSuiteKind: command => `Claude continue de lancer toute la suite \`${command}\` après des éditions d’un seul fichier`,
    fullSuiteWhy: fois => `${compte(fois, 'exécution complète', 'exécutions complètes')}, chacune juste après l’édition d’un seul fichier ; la première exécution et celle qui précède un commit ne comptent pas.`,
    fullSuiteFix: 'Lance seulement les tests du fichier modifié, puis toute la suite une fois la phase terminée.',
    fullSuiteRuleTitle: 'Tests ciblés',
    fullSuiteRule: 'Lance seulement les tests des fichiers modifiés ; lance toute la suite une fois, en fin de phase.',
    sameSearchKind: search => `Claude continue de relancer la même recherche : ${search}`,
    sameSearchWhy: fois => `${compte(fois, 'recherche identique', 'recherches identiques')} sans édition entre elles : chacune a trouvé ce que la précédente avait trouvé.`,
    sameSearchFix: 'Réutilise le résultat d’une recherche déjà faite ; relance-la seulement après un changement de fichiers.',
    logDumpKind: command => `Claude continue de lire un journal entier avec \`${command}\``,
    logDumpWhy: (fois, chars) => `${compte(fois, 'exécution')} de ${chars} caractères ou plus chacune, lues en entier au lieu d’être filtrées.`,
    logDumpFix: "Filtre un journal avant de le lire : passe-le par grep -nE 'ERROR|FAIL|Traceback' et tail -n 50.",
    logDumpRuleTitle: 'Journaux filtrés',
    logDumpRule: "Filtre les journaux avant de les lire (grep -nE 'ERROR|FAIL|Traceback', tail -n 50) ; ne lis jamais un journal entier.",
    reExploreKind: 'Claude continue de faire relire aux sous-agents des fichiers que la session principale avait déjà lus',
    reExploreWhy: (agents, lectures, chars) => `${compte(agents, 'sous-agent')} ${agents === 1 ? 'a' : 'ont'} relu ${compte(lectures, 'fichier ou recherche', 'fichiers ou recherches')} que la session principale avait déjà lus avant de ${agents === 1 ? 'le' : 'les'} lancer, soit ${chars} caractères de nouveau.`,
    reExploreFix: 'Mets dans la consigne du sous-agent ce que tu as déjà lu — les chemins et ce qui compte dedans — pour qu’il ne lise que ce qui est nouveau.',
    reExploreBriefTitle: 'Réutiliser les lectures du parent',
    reExploreBrief: 'Le parent a déjà lu les fichiers que nomme cette consigne et en résume l’essentiel ; relis-en un seulement pour le modifier ou vérifier un détail absent du résumé.',
    prefixKind: {
      model: 'Claude continue de changer de modèle en cours de session, et chaque changement réécrit le cache du prompt',
      effort: 'Claude continue de changer de niveau d’effort en cours de session, et chaque changement réécrit le cache du prompt',
    },
    prefixWhy: (fois, tours, tokens) =>
      `${compte(fois, 'changement')} (tour${tours.includes(',') ? 's' : ''} ${tours})${tokens === null ? '' : ` ; les pas qui les ont suivis ont écrit ~${tokens} tokens de plus dans le cache qu’un pas ordinaire`}.`,
    prefixFix: 'Garde un seul modèle et un seul niveau d’effort pour le reste de la session ; change-les entre deux sessions ou juste après un /compact.',
  },

  config: {
    languageLabel: 'Langue',
    languageAvailable: tags => `Disponibles : ${tags.join(', ')}.`,
  },
}
