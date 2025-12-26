- importer les données de wordnet -> import-raw-data.py
- les transformer en graphe lemma centric -> build-lemma-graph.ts

```
npx ts-node scripts/data_pipeline/build-lemma-graph.ts \
 --input=./data/raw/omw-fr-1.4 \
 --output=./app/public/lemma-graph.json
```

- importer données de wiktionnaire

-> https://dumps.wikimedia.org/frwiktionary/latest/
frwiktionary-latest-pages-articles.xml.bz2         20-Dec-2025 14:28           845708126

- extraire l'étymologie brut du wiktionnaire scripts/data_pipeline/extract_frwiktionary_etym_raw.py
- préparer les arêtes étymologiques scripts/data_pipeline/build_wiktionary_etym_edges.py

```
python scripts/data_pipeline/build_wiktionary_etym_edges.py \
  --input data/wiktionary/fr_etym_raw.jsonl \
  --output data/etym/lemma_etym_edges.jsonl \
  --cap-per-source 8 \
  --cap-per-pattern etyl=5,lien=3,wikilink=1 \
  --allow-langs la,grc,fro,frm,gmh,goh,ang,en,it,es,pt,unknown
```


- merge étymologie merge_etymology.py

```
python3 scripts/data_pipeline/merge_etymology.py \
  --graph app/public/lemma-graph.json \
  --etym data/etym/lemma_etym_edges.jsonl \
  --capPerSource 5 \
  --capExternalDegree 200 \
  --weight 0.2 \
  --out app/public/lemma-graph+etym.json
```

- trouver les cluster dans la grande composante (Leiden) -> make_clusters.py

```
python3 scripts/data_pipeline/make_clusters.py \
  --graph app/public/lemma-graph+etym.json \
  --exclude-etymology \
  --remove-types DERIVATION \
  --resolution 0.8 \
  --seed 123 \
  --min-galaxy-size 20 \
  --export-galaxy-graph \
  --min-galaxy-edge 2 \
  --out-membership data/galaxy_membership.jsonl \
  --out-galaxies data/galaxies.json \
  --out-galaxy-graph data/galaxy_graph.json




```

- nommer les galaxies -> name_galaxies.py

```
python3 scripts/data_pipeline/name_galaxies.py --clusters data/galaxies.json --out data/galaxies_named.json

```

- calculer les positions célestes -> compute_positions_cosmic.py

```
python3 scripts/data_pipeline/compute_positions_cosmic.py \
  --lemma-graph app/public/lemma-graph+etym.json \
  --membership data/galaxy_membership.jsonl \
  --galaxy-graph data/galaxy_graph.json \
  --intra-layout drl \
  --exclude-etymology \
  --macro-radius 300 \
  --macro-spread-exp 0.35 \
  --galaxy-radius-base 12 \
  --galaxy-radius-exp 0.38 \
  --galaxy-radius-max 70 \
  --max-intra-layout 2500 \
  --out-galaxies-pos data/positions_galaxies.json \
  --out-stars-pos data/positions_stars.json


```
- calculer les bundles pour les galaxies build_galaxy_bundles.py
- calculer les bundles pour les étoiles build_star_backbone.py


- créer le fichier final -> export_universe.ts

```
python3 scripts/data_pipeline/export_universe.py ...

```
