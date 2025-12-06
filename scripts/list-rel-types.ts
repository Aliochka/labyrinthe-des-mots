import fs from 'fs';
import readline from 'readline';

async function main() {
    const file = '../data/raw/omw-fr-1.4/relations.tab'; // adapte si besoin

    const rl = readline.createInterface({
        input: fs.createReadStream(file),
        crlfDelay: Infinity,
    });

    const types = new Set<string>();
    let isFirstLine = true;

    for await (const line of rl) {
        if (!line.trim()) continue;

        // sauter l'en-tête "synset1\trelation\tsynset2"
        if (isFirstLine) {
            isFirstLine = false;
            continue;
        }

        const parts = line.split('\t');
        if (parts.length < 3) continue;

        const rel = parts[1]; // 👈 la colonne "relation"
        types.add(rel);
    }

    console.log('Relation types:');
    console.log([...types].sort().join('\n'));
}

main().catch(console.error);
