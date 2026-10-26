// Picks screening candidates from the Tranco top list: EU country domains, mid-ranked,
// interleaved by TLD so every batch mixes languages. Deterministic (seeded) so batches are stable.
//   node candidates.mjs <tranco.csv> <out.txt>
import fs from 'node:fs';

const [, , trancoPath, outPath] = process.argv;
const TLDS = ['ro', 'de', 'fr', 'it', 'es', 'pl', 'nl', 'at', 'se', 'cz', 'pt', 'be', 'dk', 'fi', 'gr', 'hu', 'sk', 'ie'];
const MIN_RANK = 1000;
const MAX_RANK = 40000;
const PER_TLD = 40;
const SKIP = /(porn|sex|xxx|escort|casino|bet|bingo|lotto|poker|slot|cdn|api\.|static|img|cloud|mail|vpn|torrent|adult|dating)/;

// mulberry32
let seed = 20261026;
const random = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const byTld = Object.fromEntries(TLDS.map((t) => [t, []]));
for (const line of fs.readFileSync(trancoPath, 'utf8').split('\n')) {
    const [rankText, domain] = line.trim().split(',');
    const rank = Number(rankText);
    if (!domain || rank < MIN_RANK || rank > MAX_RANK || SKIP.test(domain)) continue;
    // registrable domains only: name.tld, no subdomains
    const parts = domain.split('.');
    if (parts.length !== 2 || !byTld[parts[1]]) continue;
    byTld[parts[1]].push(domain);
}

for (const list of Object.values(byTld)) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    list.length = Math.min(list.length, PER_TLD);
}

const out = [];
for (let i = 0; i < PER_TLD; i++) {
    for (const tld of TLDS) {
        if (byTld[tld][i]) out.push(byTld[tld][i]);
    }
}
fs.writeFileSync(outPath, out.join('\n') + '\n');
console.log(`${out.length} candidates`, Object.fromEntries(TLDS.map((t) => [t, byTld[t].length])));
