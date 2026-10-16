# illustrator-controle-preflight

**ControlePreflight.jsx** — contrôle « preflight » avant impression pour Adobe Illustrator (ExtendScript, FR/EN).
*Print preflight check for Adobe Illustrator.*

> **Statut : non testé dans Illustrator.** La syntaxe ES3 a été vérifiée automatiquement (acorn) et la logique relue, mais le script n'a pas encore été exécuté dans Illustrator. Travaillez sur une **copie** de votre fichier.
> *Status: not tested in Illustrator. ES3 syntax checked (acorn) and logic reviewed only. Work on a copy of your file.*

## Pourquoi / Why

Illustrator n'a pas de panneau *Contrôle en amont* comme InDesign. Ce script analyse le document actif **en lecture seule** et liste les problèmes d'impression courants, puis vous laisse choisir quoi en faire.

| Niveau | Contrôle | Détail |
|---|---|---|
| ERREUR | Traits trop fins | Trait visible plus fin que le seuil (0,25 pt par défaut) |
| AVERT. | Texte trop petit | Corps effectif (mise à l'échelle comprise) sous le seuil (6 pt) |
| AVERT. | Petit texte noir en quadri | Noir ≥ 80 % K avec du C/M/J, sous 12 pt (risque de repérage) |
| ERREUR | Texte en excès (approx.) | Texte captif ou curviligne qui déborde (blocs non chaînés uniquement) |
| AVERT. | Blocs de texte vides | Blocs sans caractère visible |
| INFO | Texte non vectorisé | Nombre de blocs + liste des polices utilisées |
| ERREUR | Blanc en surimpression | Fond, contour ou texte blanc réglé en surimpression (il disparaît à l'impression) |
| ERREUR | Couleur de repérage | [Repérage] utilisé dans l'illustration |
| AVERT. | Contenu RVB (doc. CMJN) | Images incorporées RVB, tons directs définis en RVB |
| INFO | Tons directs utilisés | Liste des tons directs |
| ERREUR | Liens manquants | Images liées introuvables |
| INFO | Images incorporées | Nombre d'images incorporées |
| AVERT. | Hors plans de travail + fond perdu | Objets de premier niveau entièrement hors de tous les plans de travail (élargis du fond perdu, 3 mm par défaut) |
| AVERT. | Points isolés | Tracés d'un seul point |
| INFO | Objets masqués | Objets cachés |

Après l'analyse, une fenêtre de résultats propose :

- **Sélectionner** les objets de la catégorie choisie ;
- **Marquer** les problèmes (hors INFO) par des cadres magenta pointillés numérotés sur un calque **non imprimable et verrouillé** `PREFLIGHT (a supprimer / delete me)` ; le numéro correspond à la ligne de la liste ;
- **Enregistrer un rapport `.txt`** (à côté du document, ou sur le Bureau s'il n'est pas enregistré).

L'analyse ne modifie rien. Seul le marquage ajoute un calque ; il s'annule avec Ctrl+Z / Cmd+Z (normalement en une seule étape) ou en supprimant le calque.

## Installation

- **Ponctuelle** : dans Illustrator, *Fichier > Scripts > Autre script…* (Ctrl+F12 / Cmd+F12), puis choisir `ControlePreflight.jsx`.
- **Permanente** : copier `ControlePreflight.jsx` dans le dossier `Presets/<langue>/Scripts` d'Illustrator, puis redémarrer Illustrator :
  - Windows : `C:\Program Files\Adobe\Adobe Illustrator <version>\Presets\fr_FR\Scripts`
  - macOS : `/Applications/Adobe Illustrator <version>/Presets.localized/fr_FR/Scripts`

  Le script apparaît alors dans *Fichier > Scripts*.

## Utilisation / Usage

1. Ouvrez le document à contrôler (un message s'affiche si aucun document n'est ouvert).
2. Lancez le script, cochez les contrôles voulus et ajustez les seuils (trait minimal, corps minimal, noir quadri, fond perdu en mm).
3. Cliquez sur **Analyser**, lisez la liste, puis choisissez une action.

## Version ciblée / Target

Illustrator CC 2018 et versions plus récentes (ExtendScript ES3, ScriptUI). Pas d'UXP nécessaire.

## Limites connues / Known limits

- Le texte en excès est estimé en comparant les lignes visibles au contenu complet ; les blocs chaînés sont ignorés.
- La résolution effective des images n'est pas contrôlée (l'API ExtendScript ne donne pas la taille en pixels de manière fiable).
- Les couleurs des dégradés et des motifs ne sont pas analysées.
- Les blocs de texte très longs ne sont analysés que sur leurs 3 000 premières plages de texte ; le marquage est limité à 1 500 repères.
- C'est une aide, pas une garantie : faites toujours un contrôle visuel et suivez les consignes de votre imprimeur.

## Confidentialité / Privacy

Aucun appel réseau, aucune collecte de données. Le seul fichier écrit est le rapport `.txt`, à l'endroit que vous choisissez.

## Licence

MIT — © 2026 Amirouche Amwanes. Code original. Voir `LICENSE`.
