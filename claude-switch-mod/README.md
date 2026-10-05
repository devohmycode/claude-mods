# switch — modèle et effort en un clic

Un panneau qui liste les modèles et les niveaux d'effort ; un clic change
l'un ou l'autre.

```
◆ Modèle claude-opus-5-5
╭──────────────────────────────╮
│ ○ 1: Fable 5.1  le plus fort │
│ ● 2: Opus       profond      │
│ ○ 3: Sonnet     équilibré    │
│ ○ 4: Haiku      rapide       │
╰──────────────────────────────╯
⚡ Effort medium
╭──────────────────────────────╮
│ ○ l: low        ▰▱▱▱▱        │
│ ● m: medium     ▰▰▱▱▱        │
│ ○ h: high       ▰▰▰▱▱        │
│ ○ x: xhigh      ▰▰▰▰▱        │
│ ○ a: max        ▰▰▰▰▰        │
╰──────────────────────────────╯
⚠ Changer vide le cache : la requête suivante se paie en entier.
1–4 modèle · l m h x a effort
```

Chaque modèle a sa couleur : violet pour Fable, orange pour Opus, bleu pour
Sonnet, vert pour Haiku. Le cadre des modèles prend la couleur du modèle
actif. L'effort va du vert au rouge, et son cadre prend la couleur du niveau
actif.

Un basculement réussi s'annonce par une notification du mod pendant 5 s :
`⇄ Modèle Opus → Sonnet` ou `⚡ Effort medium → max`. Si le changement
échoue, la notification donne la raison.

## Utilisation

| Commande | Effet |
| --- | --- |
| `/switch` | ouvre le panneau |
| `/switch opus`, `/switch sonnet`, `/switch haiku`, `/switch fable` | change de modèle sans le panneau |
| `/switch low` … `/switch max` | change d'effort sans le panneau |

Une fois le panneau focalisé, les chiffres `1`–`4` choisissent un modèle, et
`l`, `m`, `h`, `x`, `a` un effort (low, medium, high, xhigh, max).

## Fonctionnement

- **Un clic lance la commande de Claude Code**, `/model <alias>` ou
  `/effort <niveau>`, comme si on la tapait. Le réglage de la session change
  et la ligne d'état suit ; le mod ne s'interpose pas entre la session et
  son modèle.
- **Ce que le panneau affiche vient des requêtes elles-mêmes.** Chaque
  `turn.step` principal porte le modèle et l'effort que le moteur a résolus,
  y compris après un abaissement silencieux : le panneau montre ce qui a été
  envoyé, pas ce qui a été demandé. Avant la première requête, le modèle
  vient de `$.session.model()` et l'effort du réglage `effortLevel`.
- **`/switch opus` tapé** ne peut pas lancer `/model` depuis son propre hook :
  la session attend ce hook. Le mod répond tout de suite, puis lance la
  commande sur un minuteur à 0 ms.
- **Sans `/effort`** (une version qui n'en aurait pas), le mod garde le
  niveau choisi et l'écrit dans chaque requête principale à `turn.step`. Le
  panneau le signale.
- Haiku ne prend pas d'effort : les boutons d'effort sont alors grisés.

## Coût

Changer de modèle ou d'effort en cours de session invalide le cache des
messages : la requête suivante relit tout le contexte au prix plein (mesuré
pour l'effort en J5). Le panneau le rappelle en bas.

## Hors périmètre

`/effort auto` et `ultracode` ne sont pas proposés : `turn.step` rapporte le
niveau résolu, si bien qu'un bouton `auto` ne pourrait jamais apparaître
comme actif.
