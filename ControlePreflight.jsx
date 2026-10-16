//@target illustrator
/*
 * ControlePreflight.jsx  —  v1.0.0
 * ----------------------------------------------------------------------------
 * FR : Contrôle « preflight » avant impression pour Adobe Illustrator.
 *      Illustrator n'a pas de panneau Contrôle en amont comme InDesign : ce
 *      script analyse le document actif (lecture seule) et liste les problèmes
 *      courants : traits trop fins, texte trop petit, petit texte noir en
 *      quadri, texte en excès, blanc en surimpression, couleur de repérage,
 *      contenu RVB dans un document CMJN, liens manquants, objets hors
 *      plans de travail, points isolés, etc.
 *      Ensuite, au choix : sélectionner les objets d'une catégorie, les
 *      marquer sur un calque non imprimable, ou enregistrer un rapport .txt.
 * EN : Print preflight check for Adobe Illustrator. Illustrator has no
 *      Preflight panel like InDesign: this script scans the active document
 *      (read-only) and lists common print issues. Then you can select the
 *      items of one category, mark them on a non-printing layer, or save a
 *      .txt report.
 *
 * Cible / Target : Illustrator CC (2018+) jusqu'aux versions récentes.
 * Statut / Status : NON TESTÉ DANS ILLUSTRATOR — syntaxe ES3 vérifiée (acorn).
 *                   NOT TESTED IN ILLUSTRATOR — ES3 syntax checked (acorn).
 * Conseil : travaillez sur une copie de votre fichier.
 * Tip     : work on a copy of your file.
 * Aucune connexion réseau, aucune collecte de données.
 * No network access, no data collection.
 *
 * Licence MIT — (c) 2026 Amirouche Amwanes
 */

(function () {

    // ------------------------------------------------------------------
    // Garde-fous / Guards
    // ------------------------------------------------------------------
    if (app.documents.length === 0) {
        alert("Aucun document ouvert.\nOuvrez un document puis relancez le script.\n\nNo document open.\nOpen a document and run the script again.");
        return;
    }

    var doc = app.activeDocument;
    var MM = 72 / 25.4;                       // points par millim\u00e8tre / points per mm
    var PF_LAYER = "PREFLIGHT (a supprimer / delete me)";
    var MAX_MARKERS = 1500;                   // limite de rep\u00e8res / marker cap
    var MAX_RUNS = 3000;                      // limite de plages de texte par bloc / text runs cap
    var isCMYK = (doc.documentColorSpace == DocumentColorSpace.CMYK);

    // ------------------------------------------------------------------
    // Petites fonctions utilitaires (ES3) / Small ES3 helpers
    // ------------------------------------------------------------------
    function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
    function noSpace(s) { return String(s).replace(/\s+/g, ""); }
    function inArray(a, v) { for (var i = 0; i < a.length; i++) { if (a[i] === v) { return true; } } return false; }
    function addUnique(a, v) { if (!inArray(a, v)) { a.push(v); } }
    function toNum(txt, def) {
        var n = parseFloat(String(txt).replace(",", "."));
        return (isNaN(n) || n < 0) ? def : n;
    }
    function round2(n) { return Math.round(n * 100) / 100; }

    // Calque de l'objet (ou null) / layer holding the item (or null)
    function layerName(item) {
        try { return item.layer.name; } catch (e) { return ""; }
    }

    // ------------------------------------------------------------------
    // Tests de couleur / Colour tests
    // ------------------------------------------------------------------
    function isRegistration(c) {
        try {
            return c.typename === "SpotColor" && c.spot.colorType == ColorModel.REGISTRATION;
        } catch (e) { return false; }
    }

    function isWhite(c) {
        if (!c) { return false; }
        try {
            switch (c.typename) {
                case "CMYKColor": return c.cyan < 0.5 && c.magenta < 0.5 && c.yellow < 0.5 && c.black < 0.5;
                case "GrayColor": return c.gray < 0.5;
                case "RGBColor":  return c.red > 254.5 && c.green > 254.5 && c.blue > 254.5;
                case "LabColor":  return c.l > 99.5;
                case "SpotColor":
                    if (isRegistration(c)) { return false; }
                    if (c.tint < 0.5) { return true; }
                    return isWhite(c.spot.color);
            }
        } catch (e) {}
        return false;
    }

    // Noir composé de plusieurs encres / black built from several inks
    function isRichBlack(c) {
        try {
            return c.typename === "CMYKColor" && c.black >= 80 && (c.cyan + c.magenta + c.yellow) >= 1;
        } catch (e) { return false; }
    }

    // ------------------------------------------------------------------
    // Définition des catégories / Category definitions
    // level : "ERR" (erreur / error), "WARN" (avertissement), "INFO"
    // ------------------------------------------------------------------
    var CATS = [
        { id: "thinStroke",     level: "ERR",  label: "Traits trop fins / Strokes too thin" },
        { id: "smallText",      level: "WARN", label: "Texte trop petit / Text too small" },
        { id: "richBlackText",  level: "WARN", label: "Petit texte noir en quadri / Small 4-colour black text" },
        { id: "overset",        level: "ERR",  label: "Texte en exc\u00e8s (approx.) / Overset text (approx.)" },
        { id: "emptyText",      level: "WARN", label: "Blocs de texte vides / Empty text frames" },
        { id: "liveText",       level: "INFO", label: "Texte non vectoris\u00e9 / Live (non-outlined) text" },
        { id: "whiteOverprint", level: "ERR",  label: "Blanc en surimpression / White set to overprint" },
        { id: "registration",   level: "ERR",  label: "Couleur de rep\u00e9rage dans l'illustration / Registration colour in artwork" },
        { id: "rgbContent",     level: "WARN", label: "Contenu RVB (doc. CMJN) / RGB content (CMYK doc)" },
        { id: "spotUsed",       level: "INFO", label: "Tons directs utilis\u00e9s / Spot colours used" },
        { id: "missingLink",    level: "ERR",  label: "Liens manquants / Missing links" },
        { id: "embedded",       level: "INFO", label: "Images incorpor\u00e9es / Embedded images" },
        { id: "outside",        level: "WARN", label: "Hors plans de travail + fond perdu / Outside artboards + bleed" },
        { id: "strayPoint",     level: "WARN", label: "Points isol\u00e9s / Stray points" },
        { id: "hidden",         level: "INFO", label: "Objets masqu\u00e9s / Hidden objects" }
    ];

    function newResults() {
        var r = {};
        for (var i = 0; i < CATS.length; i++) {
            r[CATS[i].id] = { items: [], notes: [] };
        }
        return r;
    }

    // ------------------------------------------------------------------
    // 1) Fenêtre de réglages / Settings dialog
    // ------------------------------------------------------------------
    function settingsDialog() {
        var w = new Window("dialog", "Contr\u00f4le preflight / Preflight check  v1.0.0");
        w.orientation = "column";
        w.alignChildren = "fill";

        var head = w.add("statictext", undefined,
            "Analyse en lecture seule : rien n'est modifi\u00e9 tant que vous ne choisissez pas une action.\n" +
            "Read-only scan: nothing changes until you pick an action.", { multiline: true });
        head.preferredSize.width = 460;

        var mode = w.add("statictext", undefined,
            "Mode colorim\u00e9trique du document / Document colour mode : " + (isCMYK ? "CMJN / CMYK" : "RVB / RGB"));
        if (!isCMYK) {
            w.add("statictext", undefined,
                "Attention : document RVB. Pour l'impression, un document CMJN est en g\u00e9n\u00e9ral pr\u00e9f\u00e9rable.\n" +
                "Warning: RGB document. For print, a CMYK document is usually preferable.", { multiline: true }).preferredSize.width = 460;
        }

        var pc = w.add("panel", undefined, "Contr\u00f4les / Checks");
        pc.alignChildren = "left";
        pc.margins = 12;
        var boxes = {};
        for (var i = 0; i < CATS.length; i++) {
            boxes[CATS[i].id] = pc.add("checkbox", undefined, CATS[i].label);
            boxes[CATS[i].id].value = true;
        }
        if (!isCMYK) { boxes.rgbContent.value = false; boxes.rgbContent.enabled = false; }

        var pt = w.add("panel", undefined, "Seuils / Thresholds");
        pt.alignChildren = "left";
        pt.margins = 12;
        function row(label, def) {
            var g = pt.add("group");
            var s = g.add("statictext", undefined, label);
            s.preferredSize.width = 330;
            var e = g.add("edittext", undefined, def);
            e.characters = 6;
            return e;
        }
        var eStroke = row("Trait minimal (pt) / Minimum stroke (pt)", "0.25");
        var eText   = row("Corps de texte minimal (pt) / Minimum text size (pt)", "6");
        var eRich   = row("Noir quadri signal\u00e9 sous (pt) / Flag 4-colour black below (pt)", "12");
        var eBleed  = row("Fond perdu (mm) / Bleed (mm)", "3");

        var btns = w.add("group");
        btns.alignment = "right";
        btns.add("button", undefined, "Annuler / Cancel", { name: "cancel" });
        btns.add("button", undefined, "Analyser / Scan", { name: "ok" });

        if (w.show() !== 1) { return null; }

        var on = {};
        for (var k = 0; k < CATS.length; k++) { on[CATS[k].id] = boxes[CATS[k].id].value; }
        return {
            on: on,
            minStroke: toNum(eStroke.text, 0.25),
            minText: toNum(eText.text, 6),
            richBelow: toNum(eRich.text, 12),
            bleed: toNum(eBleed.text, 3) * MM
        };
    }

    // ------------------------------------------------------------------
    // 2) Analyse / Scan
    // ------------------------------------------------------------------
    function scan(opt) {
        var R = newResults();
        var on = opt.on;
        var i, j;

        // --- Tracés / Paths ---
        var paths = doc.pathItems;
        for (i = 0; i < paths.length; i++) {
            var p = paths[i];
            try {
                if (p.guides) { continue; }
                if (layerName(p) === PF_LAYER) { continue; }
                if (on.strayPoint && p.pathPoints.length === 1) { R.strayPoint.items.push(p); continue; }
                if (p.clipping) { continue; }

                var hasStroke = p.stroked && p.strokeColor && p.strokeColor.typename !== "NoColor";
                var hasFill = p.filled && p.fillColor && p.fillColor.typename !== "NoColor";

                if (on.thinStroke && hasStroke && p.strokeWidth < opt.minStroke) {
                    R.thinStroke.items.push(p);
                }
                if (on.whiteOverprint &&
                    ((hasFill && p.fillOverprint && isWhite(p.fillColor)) ||
                     (hasStroke && p.strokeOverprint && isWhite(p.strokeColor)))) {
                    R.whiteOverprint.items.push(p);
                }
                if (on.registration &&
                    ((hasFill && isRegistration(p.fillColor)) || (hasStroke && isRegistration(p.strokeColor)))) {
                    R.registration.items.push(p);
                }
                checkSpot(p, hasFill ? p.fillColor : null, R, on);
                checkSpot(p, hasStroke ? p.strokeColor : null, R, on);
            } catch (eP) {}
        }

        // --- Textes / Text frames ---
        var tfs = doc.textFrames;
        for (i = 0; i < tfs.length; i++) {
            var tf = tfs[i];
            try {
                if (layerName(tf) === PF_LAYER) { continue; }
                if (trim(tf.contents) === "") {
                    if (on.emptyText) { R.emptyText.items.push(tf); }
                    continue;
                }
                if (on.liveText) { R.liveText.items.push(tf); }
                if (on.overset && isOverset(tf)) { R.overset.items.push(tf); }
                scanTextRuns(tf, opt, R);
            } catch (eT) {}
        }

        // --- Images incorporées / Embedded rasters ---
        var rasters = doc.rasterItems;
        for (i = 0; i < rasters.length; i++) {
            var ri = rasters[i];
            try {
                if (on.embedded && ri.embedded) { R.embedded.items.push(ri); }
                if (on.rgbContent && isCMYK && ri.imageColorSpace == ImageColorSpace.RGB) {
                    R.rgbContent.items.push(ri);
                    addUnique(R.rgbContent.notes, "Image RVB / RGB image");
                }
            } catch (eR) {}
        }

        // --- Images liées / Linked (placed) items ---
        if (on.missingLink) {
            var placed = doc.placedItems;
            for (i = 0; i < placed.length; i++) {
                var pl = placed[i];
                var missing = false;
                try {
                    var f = pl.file;
                    if (!f || !f.exists) { missing = true; } else { continue; }
                } catch (eL) { missing = true; }
                if (missing) { R.missingLink.items.push(pl); }
            }
        }

        // --- Hors plans de travail / Outside artboards (objets de premier niveau) ---
        if (on.outside) {
            var rects = [];
            for (j = 0; j < doc.artboards.length; j++) { rects.push(doc.artboards[j].artboardRect); }
            for (j = 0; j < doc.layers.length; j++) { scanLayerOutside(doc.layers[j], rects, opt.bleed, R); }
        }

        // --- Objets masqués / Hidden objects ---
        if (on.hidden) {
            var all = doc.pageItems;
            for (i = 0; i < all.length; i++) {
                try { if (all[i].hidden) { R.hidden.items.push(all[i]); } } catch (eH) {}
            }
        }
        return R;
    }

    // Tons directs : liste + définition RVB / Spot colours: list + RGB definition
    function checkSpot(item, c, R, on) {
        if (!c) { return; }
        try {
            if (c.typename !== "SpotColor" || isRegistration(c)) { return; }
            if (on.spotUsed) {
                addUnique(R.spotUsed.notes, c.spot.name);
                if (!inArray(R.spotUsed.items, item)) { R.spotUsed.items.push(item); }
            }
            if (on.rgbContent && isCMYK && c.spot.color.typename === "RGBColor") {
                addUnique(R.rgbContent.notes, "Ton direct d\u00e9fini en RVB / Spot defined in RGB : " + c.spot.name);
                if (!inArray(R.rgbContent.items, item)) { R.rgbContent.items.push(item); }
            }
        } catch (e) {}
    }

    // Échelle d'un bloc de texte transformé / scale of a transformed text frame
    function textScale(tf) {
        try {
            var m = tf.matrix;
            var s = Math.sqrt(Math.abs(m.mValueA * m.mValueD - m.mValueB * m.mValueC));
            return (s > 0) ? s : 1;
        } catch (e) { return 1; }
    }

    // Parcourt les plages de texte / walks the text runs of a frame
    function scanTextRuns(tf, opt, R) {
        var on = opt.on;
        var scale = textScale(tf);
        var runs = tf.textRanges;
        var n = Math.min(runs.length, MAX_RUNS);
        var fSmall = false, fRich = false, fWhite = false, fReg = false;
        for (var k = 0; k < n; k++) {
            try {
                var ca = runs[k].characterAttributes;
                if (noSpace(runs[k].contents) === "") { continue; }
                var size = ca.size * scale;
                var col = ca.fillColor;
                if (on.liveText) {
                    try { addUnique(R.liveText.notes, ca.textFont.name); } catch (eF) {}
                }
                if (!fSmall && on.smallText && size < opt.minText) { fSmall = true; }
                if (!fRich && on.richBlackText && size < opt.richBelow && isRichBlack(col)) { fRich = true; }
                if (!fWhite && on.whiteOverprint && ca.overprintFill && isWhite(col)) { fWhite = true; }
                if (!fReg && on.registration && isRegistration(col)) { fReg = true; }
                checkSpot(tf, col, R, on);
            } catch (e) {}
        }
        if (fSmall) { R.smallText.items.push(tf); }
        if (fRich) { R.richBlackText.items.push(tf); }
        if (fWhite) { R.whiteOverprint.items.push(tf); }
        if (fReg) { R.registration.items.push(tf); }
    }

    // Texte en excès : compare le texte visible (lignes) au contenu complet.
    // Overset text: compares visible lines with full contents. Threaded
    // frames are skipped (approximation, see README).
    function isOverset(tf) {
        if (tf.kind == TextType.POINTTEXT) { return false; }
        try { if (tf.nextFrame || tf.previousFrame) { return false; } } catch (e0) {}
        var full = noSpace(tf.contents);
        if (full.length === 0) { return false; }
        var lines = tf.lines;
        if (lines.length === 0) { return true; }
        var visible = "";
        for (var i = 0; i < lines.length; i++) { visible += lines[i].contents; }
        return noSpace(visible).length < full.length;
    }

    // Objets de premier niveau hors de tout plan de travail élargi du fond perdu
    // Top-level items outside every artboard expanded by the bleed
    function scanLayerOutside(layer, rects, bleed, R) {
        if (layer.name === PF_LAYER) { return; }
        var i;
        for (i = 0; i < layer.pageItems.length; i++) {
            var it = layer.pageItems[i];
            try {
                if (it.typename === "PathItem" && it.guides) { continue; }
                var b = it.visibleBounds;  // [left, top, right, bottom]
                var inside = false;
                for (var j = 0; j < rects.length; j++) {
                    var a = rects[j];
                    if (!(b[2] < a[0] - bleed || b[0] > a[2] + bleed || b[1] < a[3] - bleed || b[3] > a[1] + bleed)) {
                        inside = true; break;
                    }
                }
                if (!inside) { R.outside.items.push(it); }
            } catch (e) {}
        }
        for (i = 0; i < layer.layers.length; i++) { scanLayerOutside(layer.layers[i], rects, bleed, R); }
    }

    // ------------------------------------------------------------------
    // 3) Rapport / Report
    // ------------------------------------------------------------------
    function levelTag(l) {
        return l === "ERR" ? "[ERREUR/ERROR]" : (l === "WARN" ? "[AVERT./WARN]" : "[INFO]");
    }

    function reportText(R, opt) {
        var out = [];
        out.push("Contr\u00f4le preflight / Preflight check \u2014 ControlePreflight.jsx v1.0.0");
        out.push("Document : " + doc.name);
        out.push("Date : " + new Date().toString());
        out.push("Mode : " + (isCMYK ? "CMJN / CMYK" : "RVB / RGB") + "   Plans de travail / Artboards : " + doc.artboards.length);
        out.push("Seuils / Thresholds : trait " + opt.minStroke + " pt, texte " + opt.minText +
                 " pt, noir quadri < " + opt.richBelow + " pt, fond perdu " + round2(opt.bleed / MM) + " mm");
        out.push("");
        for (var i = 0; i < CATS.length; i++) {
            var c = CATS[i];
            if (!opt.on[c.id]) { continue; }
            var r = R[c.id];
            out.push(levelTag(c.level) + " " + c.label + " : " + r.items.length);
            for (var k = 0; k < r.notes.length; k++) { out.push("    - " + r.notes[k]); }
        }
        out.push("");
        out.push("Statut : script non test\u00e9 dans Illustrator. V\u00e9rifiez toujours visuellement.");
        out.push("Status: script not tested in Illustrator. Always check visually.");
        return out.join("\n");
    }

    function reportDialog(R, opt) {
        var w = new Window("dialog", "R\u00e9sultats preflight / Preflight results");
        w.orientation = "column";
        w.alignChildren = "fill";

        var list = w.add("listbox", undefined, [], { multiselect: false });
        list.preferredSize = [560, 280];
        var ids = [];
        var problems = 0;
        for (var i = 0; i < CATS.length; i++) {
            var c = CATS[i];
            if (!opt.on[c.id]) { continue; }
            var count = R[c.id].items.length;
            if (c.level !== "INFO") { problems += count; }
            list.add("item", levelTag(c.level) + "  " + c.label + " : " + count);
            ids.push(c.id);
        }
        if (list.items.length > 0) { list.selection = 0; }

        w.add("statictext", undefined, "Probl\u00e8mes (hors INFO) / Issues (excluding INFO) : " + problems);

        var details = w.add("edittext", undefined, "", { multiline: true, readonly: true, scrolling: true });
        details.preferredSize = [560, 90];
        function refresh() {
            if (!list.selection) { details.text = ""; return; }
            var r = R[ids[list.selection.index]];
            details.text = r.notes.length ? r.notes.join("\n") : "\u2014";
        }
        list.onChange = refresh;
        refresh();

        var result = { action: "close", id: null };
        var g = w.add("group");
        g.alignment = "right";
        var bSel  = g.add("button", undefined, "S\u00e9lectionner / Select");
        var bMark = g.add("button", undefined, "Marquer / Mark");
        var bSave = g.add("button", undefined, "Rapport .txt / Save report");
        var bClose = g.add("button", undefined, "Fermer / Close", { name: "cancel" });

        bSel.onClick = function () {
            if (!list.selection) { return; }
            result.action = "select"; result.id = ids[list.selection.index]; w.close(1);
        };
        bMark.onClick = function () { result.action = "mark"; w.close(1); };
        bSave.onClick = function () { result.action = "save"; w.close(1); };
        bClose.onClick = function () { result.action = "close"; w.close(2); };

        w.show();
        return result;
    }

    // ------------------------------------------------------------------
    // 4) Actions
    // ------------------------------------------------------------------
    function selectCategory(R, id) {
        var items = R[id].items;
        doc.selection = null;
        var ok = 0;
        for (var i = 0; i < items.length; i++) {
            try { items[i].selected = true; ok++; } catch (e) {}
        }
        var skipped = items.length - ok;
        alert(ok + " objet(s) s\u00e9lectionn\u00e9(s) / item(s) selected." +
              (skipped > 0 ? "\n" + skipped + " objet(s) verrouill\u00e9(s) ou masqu\u00e9(s) non s\u00e9lectionnable(s) / locked or hidden item(s) could not be selected." : ""));
    }

    function markColor() {
        var c;
        if (isCMYK) {
            c = new CMYKColor(); c.cyan = 0; c.magenta = 100; c.yellow = 0; c.black = 0;
        } else {
            c = new RGBColor(); c.red = 255; c.green = 0; c.blue = 160;
        }
        return c;
    }

    // Repères sur un calque non imprimable / markers on a non-printing layer
    function markIssues(R, opt) {
        // Recrée le calque de repères / rebuild the marker layer
        try {
            var old = doc.layers.getByName(PF_LAYER);
            old.locked = false; old.visible = true;
            old.remove();
        } catch (e0) {}

        var lay = doc.layers.add();
        lay.name = PF_LAYER;
        try { lay.zOrder(ZOrderMethod.BRINGTOFRONT); } catch (eZ) {}
        var col = markColor();
        var made = 0;
        var pad = 2;

        var lineNo = 0; // numero de ligne dans la liste / line number in the list
        for (var i = 0; i < CATS.length && made < MAX_MARKERS; i++) {
            var c = CATS[i];
            if (!opt.on[c.id]) { continue; }
            lineNo++;
            if (c.level === "INFO") { continue; }
            var items = R[c.id].items;
            for (var k = 0; k < items.length && made < MAX_MARKERS; k++) {
                try {
                    var b = items[k].visibleBounds;
                    var wdt = Math.max(b[2] - b[0], 1) + pad * 2;
                    var hgt = Math.max(b[1] - b[3], 1) + pad * 2;
                    var r = lay.pathItems.rectangle(b[1] + pad, b[0] - pad, wdt, hgt);
                    r.filled = false;
                    r.stroked = true;
                    r.strokeColor = col;
                    r.strokeWidth = 1;
                    r.strokeDashes = [4, 2];
                    r.name = levelTag(c.level) + " " + c.label;
                    try {
                        var t = lay.textFrames.pointText([b[0] - pad, b[1] + pad + 2]);
                        t.contents = String(lineNo);
                        t.textRange.characterAttributes.size = 7;
                        t.textRange.characterAttributes.fillColor = col;
                        t.name = c.label;
                    } catch (eT) {}
                    made++;
                } catch (eM) {}
            }
        }
        lay.printable = false;
        lay.locked = true;
        alert(made + " rep\u00e8re(s) cr\u00e9\u00e9(s) sur le calque non imprimable \u00ab " + PF_LAYER + " \u00bb.\n" +
              "Le num\u00e9ro de chaque rep\u00e8re correspond \u00e0 la ligne de la cat\u00e9gorie dans la liste.\n" +
              "Ctrl+Z / Cmd+Z pour annuler, ou supprimez ce calque.\n\n" +
              made + " marker(s) created on the non-printing layer. Each number matches the category line in the list. " +
              "Undo with Ctrl+Z / Cmd+Z, or delete the layer." +
              (made >= MAX_MARKERS ? "\n\nLimite atteinte / Limit reached : " + MAX_MARKERS : ""));
    }

    function saveReport(R, opt) {
        var base = String(doc.name).replace(/\.[^\.]+$/, "");
        var dir = Folder.desktop;
        try { if (doc.path && String(doc.path.fsName) !== "") { dir = doc.path; } } catch (e) {}
        var start = new File(dir.fsName + "/" + base + "_preflight.txt");
        var f = start.saveDlg("Enregistrer le rapport / Save report", "*.txt");
        if (!f) { return; }
        f.encoding = "UTF-8";
        if (f.open("w")) {
            f.write(reportText(R, opt));
            f.close();
            alert("Rapport enregistr\u00e9 / Report saved :\n" + f.fsName);
        } else {
            alert("Impossible d'\u00e9crire le fichier / Could not write the file :\n" + f.fsName);
        }
    }

    // ------------------------------------------------------------------
    // Programme principal / Main
    // ------------------------------------------------------------------
    var opt = settingsDialog();
    if (!opt) { return; }

    var R = scan(opt);

    while (true) {
        var res = reportDialog(R, opt);
        if (res.action === "select") { selectCategory(R, res.id); break; }
        if (res.action === "mark") { markIssues(R, opt); break; }
        if (res.action === "save") { saveReport(R, opt); continue; }
        break;
    }

})();
