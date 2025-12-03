#!/usr/bin/env node

/**
 * Prétraitement OMW-FR 1.4 (TSV) -> JSON pour le front.
 *
 * Entrée (depuis /scripts/):
 *   ../data/raw/omw-fr-1.4/synsets.tab
 *   ../data/raw/omw-fr-1.4/senses.tab
 *   ../data/raw/omw-fr-1.4/relations.tab
 *
 * Sortie:
 *   ../public/synsets.json
 *   ../public/relations.json
 *   ../public/lexicalIndex.json
 */

const fs = require("fs");
const path = require("path");

// --- Dossiers adaptés à TA structure exacte ---
const INPUT_DIR = path.resolve(__dirname, "../data/raw/omw-fr-1.4");
const OUTPUT_DIR = path.resolve(__dirname, "../public");

// --- Chemins des fichiers TSV ---
const SYNSETS_FILE = path.join(INPUT_DIR, "synsets.tab");
const SENSES_FILE = path.join(INPUT_DIR, "senses.tab");
const RELATIONS_FILE = path.join(INPUT_DIR, "relations.tab");

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readTsv(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    if (lines.length === 0) {
        return { header: [], rows: [] };
    }

    const header = lines[0].split("\t");
    const rows = lines.slice(1).map((line) => line.split("\t"));

    return { header, rows };
}

function normalizeLemma(str) {
    if (!str) return "";
    let s = str.toLowerCase();

    // enlever accents
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // enlever apostrophes, espaces, tirets
    s = s.replace(/['’`-]/g, "");
    s = s.replace(/\s+/g, "");

    return s;
}

function mapPos(pos) {
    if (pos === "n") return "N";
    if (pos === "v") return "V";
    if (pos === "a" || pos === "s") return "ADJ";
    return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    console.log("Lecture des fichiers depuis :", INPUT_DIR);

    const synsetsTsv = readTsv(SYNSETS_FILE);
    const sensesTsv = readTsv(SENSES_FILE);
    const relationsTsv = readTsv(RELATIONS_FILE);

    // -----------------------------------------
    // 1) Charger synsets + créer ids numériques
    // -----------------------------------------

    const synsetMap = new Map(); // originalId -> {originalId, pos, lemmas, gloss}
    const synsetIds = [];

    const idxSynset = synsetsTsv.header.indexOf("synset");
    const idxPos = synsetsTsv.header.indexOf("pos");
    const idxGlossEn = synsetsTsv.header.indexOf("gloss_en");
    const idxGlossFr = synsetsTsv.header.indexOf("gloss_fr");

    if (
        idxSynset === -1 ||
        idxPos === -1 ||
        idxGlossEn === -1 ||
        idxGlossFr === -1
    ) {
        console.error("En-tête invalide dans synsets.tab :", synsetsTsv.header);
        process.exit(1);
    }

    for (const row of synsetsTsv.rows) {
        const originalId = row[idxSynset];
        const posRaw = row[idxPos];
        const glossEn = row[idxGlossEn] || "";
        const glossFr = row[idxGlossFr] || "";

        const pos = mapPos(posRaw);
        if (!pos) continue;

        const gloss = glossFr.trim() !== "" ? glossFr : glossEn;

        synsetMap.set(originalId, {
            originalId,
            pos,
            lemmas: [],
            gloss: gloss || undefined,
        });

        synsetIds.push(originalId);
    }

    synsetIds.sort();

    const numericIdByOriginal = new Map();
    synsetIds.forEach((orig, i) => numericIdByOriginal.set(orig, i));

    console.log("Synsets après filtrage POS :", synsetIds.length);

    // -----------------------------------------
    // 2) Charger senses -> remplir lemmas + lexicalIndex
    // -----------------------------------------

    const idxSenseSyn = sensesTsv.header.indexOf("synset");
    const idxSenseLemma = sensesTsv.header.indexOf("lemma");
    const idxSenseLang = sensesTsv.header.indexOf("lang");

    if (idxSenseSyn === -1 || idxSenseLemma === -1 || idxSenseLang === -1) {
        console.error("En-tête invalide dans senses.tab :", sensesTsv.header);
        process.exit(1);
    }

    const lexicalIndex = {}; // normalizedLemma -> { POS: [ids...] }

    for (const row of sensesTsv.rows) {
        const origId = row[idxSenseSyn];
        const lemma = row[idxSenseLemma];
        const lang = row[idxSenseLang];

        if (lang !== "fra") continue;
        if (!numericIdByOriginal.has(origId)) continue;

        const syn = synsetMap.get(origId);
        if (!syn) continue;

        if (!syn.lemmas.includes(lemma)) syn.lemmas.push(lemma);

        const normalized = normalizeLemma(lemma);
        if (!normalized) continue;

        const numericId = numericIdByOriginal.get(origId);
        const pos = syn.pos;

        if (!lexicalIndex[normalized]) lexicalIndex[normalized] = {};
        if (!lexicalIndex[normalized][pos])
            lexicalIndex[normalized][pos] = [];

        if (!lexicalIndex[normalized][pos].includes(numericId))
            lexicalIndex[normalized][pos].push(numericId);
    }

    console.log(
        "Entrées lexicalIndex (formes FR normalisées) :",
        Object.keys(lexicalIndex).length
    );

    // -----------------------------------------
    // 3) Construire synsets.json final
    // -----------------------------------------

    const synsetsJson = {};
    const keptIds = new Set(); // ids numériques réellement conservés

    for (const [origId, syn] of synsetMap.entries()) {
        if (!syn.lemmas || syn.lemmas.length === 0) continue;

        const numericId = numericIdByOriginal.get(origId);
        keptIds.add(numericId);

        synsetsJson[numericId] = {
            originalId: syn.originalId,
            pos: syn.pos,
            lemmas: syn.lemmas,
            ...(syn.gloss ? { gloss: syn.gloss } : {}),
        };
    }

    console.log("Synsets FR (avec lemmas) :", keptIds.size);

    // -----------------------------------------
    // 4) Relations -> relations.json
    // -----------------------------------------

    const idxRelSyn1 = relationsTsv.header.indexOf("synset1");
    const idxRelType = relationsTsv.header.indexOf("relation");
    const idxRelSyn2 = relationsTsv.header.indexOf("synset2");

    const allowed = new Set(["HYPERNYM", "HYPONYM", "ANTONYM"]);

    const relations = {};
    const relSeen = new Set();

    function addRel(a, type, b) {
        const key = `${a}|${type}|${b}`;
        if (relSeen.has(key)) return;
        relSeen.add(key);

        if (!relations[a]) relations[a] = [];
        relations[a].push([type, b]);
    }

    for (const row of relationsTsv.rows) {
        const o1 = row[idxRelSyn1];
        const o2 = row[idxRelSyn2];
        const type = row[idxRelType].toUpperCase();

        if (!allowed.has(type)) continue;
        if (!numericIdByOriginal.has(o1) || !numericIdByOriginal.has(o2)) continue;

        const id1 = numericIdByOriginal.get(o1);
        const id2 = numericIdByOriginal.get(o2);

        // FR-only strict : source et cible doivent être dans synsetsJson
        if (!keptIds.has(id1) || !keptIds.has(id2)) continue;

        addRel(id1, type, id2);
    }

    // inversions HYPERNYM/HYPONYM et symétrie ANTONYM
    for (const src of Object.keys(relations)) {
        for (const [type, tgt] of relations[src]) {
            const a = Number(src);
            const b = tgt;

            if (type === "HYPERNYM") addRel(b, "HYPONYM", a);
            else if (type === "HYPONYM") addRel(b, "HYPERNYM", a);
            else if (type === "ANTONYM") addRel(b, "ANTONYM", a);
        }
    }

    // compter relations totales
    let relCount = 0;
    for (const k of Object.keys(relations)) relCount += relations[k].length;

    console.log("Relations FR↔FR stockées :", relCount);

    // -----------------------------------------
    // 5) Écriture dans /public/
    // -----------------------------------------

    ensureDir(OUTPUT_DIR);

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "synsets.json"),
        JSON.stringify(synsetsJson, null, 2),
        "utf8"
    );

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "relations.json"),
        JSON.stringify(relations, null, 2),
        "utf8"
    );

    fs.writeFileSync(
        path.join(OUTPUT_DIR, "lexicalIndex.json"),
        JSON.stringify(lexicalIndex, null, 2),
        "utf8"
    );

    console.log("✔ Données écrites dans", OUTPUT_DIR);
    console.log("  synsets.json");
    console.log("  relations.json");
    console.log("  lexicalIndex.json");
}

main();