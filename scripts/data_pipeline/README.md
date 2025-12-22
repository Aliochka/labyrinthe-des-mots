- importer les données de wordnet -> import-raw-data.py

 ```
npx ts-node scripts/build-lemma-graph.ts \
 --input=./data/raw/omw-fr-1.4 \
 --output=./app/public/lemma-graph.json
 ```


- les transformer en graphe lemma centric -> build-lemma-graph.ts
- trouver les cluster dans la grande composante (Leiden) -> make_clusters.py

```
python3 scripts/data_pipeline/make_clusters.py \
  --graph app/public/lemma-graph-cleaned.json \
  --remove-types DERIVATION \
  --resolution 0.8 \
  --seed 123 \
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
  --lemma-graph app/public/lemma-graph.json \
  --membership data/galaxy_membership.jsonl \
  --galaxy-graph data/galaxy_graph.json \
  --intra-layout drl \
  --galaxy-radius-base 10 \
  --galaxy-radius-exp 0.35 \
  --max-intra-layout 2500 \
  --macro-radius 140 \
  --out-galaxies-pos data/positions_galaxies.json \
  --out-stars-pos data/positions_stars.json

```

- créer le fichier final -> export_universe.ts

```
python3 scripts/data_pipeline/export_universe.py \                                                         
  --galaxies-named data/galaxies_named.json \
  --galaxies-pos data/positions_galaxies.json \
  --stars-pos data/positions_stars.json \
  --membership data/galaxy_membership.jsonl \
  --out app/public/universe.json

```
