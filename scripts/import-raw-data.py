#!/usr/bin/env python3
"""
Script d'export des données WordNet + OMW-1.4 en français vers des fichiers TSV.

Ce script extrait les synsets, lemmes français et relations du WordNet anglais
enrichi avec l'Open Multilingual Wordnet 1.4 pour la langue française.

Usage:
    python import-raw-data.py
"""

import os
import sys
from collections import defaultdict
from typing import Set, Dict, List, Tuple
import nltk
from nltk.corpus import wordnet as wn


def download_nltk_resources():
    """Télécharge les ressources NLTK nécessaires si elles ne sont pas présentes."""
    resources = [
        "wordnet",
        "omw-1.4",
        "omw",  # fallback au cas où omw-1.4 ne fonctionne pas
    ]

    for resource in resources:
        try:
            nltk.data.find(f"corpora/{resource}")
            print(f"✓ Ressource {resource} déjà présente")
        except LookupError:
            print(f"⬇ Téléchargement de {resource}...")
            try:
                nltk.download(resource, quiet=True)
            except Exception as e:
                print(f"⚠ Échec du téléchargement de {resource}: {e}")


def get_synset_id(synset) -> str:
    """
    Construit l'identifiant synset au format offset-pos (ex: 00001740-n).

    Args:
        synset: Un synset NLTK

    Returns:
        String au format "00001740-n" (offset zero-padded sur 8 chiffres + pos)
    """
    # Zero-pad l'offset sur 8 chiffres
    offset = str(synset.offset()).zfill(8)
    pos = synset.pos()
    return f"{offset}-{pos}"


def get_french_lemmas(synset):
    """
    Récupère les lemmes français pour un synset via OMW-1.4
    via synset.lemma_names(lang="fra").
    """

    try:
        lemmas = synset.lemma_names(lang="fra")
        # Nettoyage doublons, juste pour être safe
        seen = set()
        result = []
        for lemma in lemmas:
            if lemma not in seen:
                seen.add(lemma)
                result.append(lemma)
        return result

    except:
        return []


def get_french_gloss(synset) -> str:
    """
    Récupère la définition française pour un synset via OMW-1.4.

    Args:
        synset: Un synset NLTK

    Returns:
        Définition en français ou chaîne vide si non disponible
    """
    try:
        # Essayer différentes méthodes pour obtenir la gloss française

        # Méthode 1: via synset.definition avec lang
        try:
            fr_def = synset.definition(lang="fra")
            if fr_def and fr_def.strip():
                return fr_def.strip()
        except:
            pass

        # Méthode 2: via OMW si disponible
        try:
            # Cette méthode peut varier selon la version d'OMW
            # Pour l'instant, on retourne une chaîne vide car OMW-1.4
            # ne contient pas toujours les définitions françaises
            pass
        except:
            pass

        return ""
    except Exception as e:
        return ""


def filter_french_synsets() -> Tuple[Set[str], Dict[str, object]]:
    """
    Filtre les synsets qui ont des lemmes français et un POS valide.

    Returns:
        Tuple (set des IDs synsets retenus, dict ID -> synset objet)
    """
    valid_pos = {"n", "v", "a", "s", "r"}
    french_synsets = set()
    synset_objects = {}

    print("🔍 Filtrage des synsets français...")

    total_synsets = 0
    french_count = 0

    for synset in wn.all_synsets():
        total_synsets += 1

        # Filtrer par POS
        if synset.pos() not in valid_pos:
            continue

        # Vérifier s'il y a des lemmes français
        french_lemmas = get_french_lemmas(synset)
        if not french_lemmas:
            continue

        # Ce synset a des lemmes français et un bon POS
        synset_id = get_synset_id(synset)
        french_synsets.add(synset_id)
        synset_objects[synset_id] = synset
        french_count += 1

        if french_count % 1000 == 0:
            print(f"  Trouvé {french_count} synsets français...")

    print(
        f"✓ {total_synsets} synsets totaux, {french_count} avec lemmes français retenus"
    )
    return french_synsets, synset_objects


def export_synsets(
    french_synsets: Set[str], synset_objects: Dict[str, object], output_dir: str
):
    """
    Exporte le fichier synsets.tab.

    Args:
        french_synsets: Set des IDs de synsets français
        synset_objects: Dict ID -> synset objet
        output_dir: Dossier de sortie
    """
    output_file = os.path.join(output_dir, "synsets.tab")

    print(f"📝 Export des synsets vers {output_file}...")

    pos_counts = defaultdict(int)

    with open(output_file, "w", encoding="utf-8") as f:
        # En-tête
        f.write("synset\tpos\tgloss_en\tgloss_fr\n")

        for synset_id in sorted(french_synsets):
            synset = synset_objects[synset_id]

            pos = synset.pos()
            gloss_en = synset.definition() or ""
            gloss_fr = get_french_gloss(synset)

            # Nettoyer les gloss des caractères problématiques (tabulations, newlines)
            gloss_en = gloss_en.replace("\t", " ").replace("\n", " ").replace("\r", " ")
            gloss_fr = gloss_fr.replace("\t", " ").replace("\n", " ").replace("\r", " ")

            f.write(f"{synset_id}\t{pos}\t{gloss_en}\t{gloss_fr}\n")
            pos_counts[pos] += 1

    print(f"✓ {len(french_synsets)} synsets exportés")
    for pos, count in sorted(pos_counts.items()):
        print(f"  {pos}: {count}")


def export_senses(
    french_synsets: Set[str], synset_objects: Dict[str, object], output_dir: str
) -> int:
    """
    Exporte le fichier senses.tab.

    Args:
        french_synsets: Set des IDs de synsets français
        synset_objects: Dict ID -> synset objet
        output_dir: Dossier de sortie

    Returns:
        Nombre de lignes (senses) exportées
    """
    output_file = os.path.join(output_dir, "senses.tab")

    print(f"📝 Export des senses vers {output_file}...")

    total_senses = 0

    with open(output_file, "w", encoding="utf-8") as f:
        # En-tête
        f.write("synset\tlemma\tlang\tsense_number\n")

        for synset_id in sorted(french_synsets):
            synset = synset_objects[synset_id]
            french_lemmas = get_french_lemmas(synset)

            # Supprimer les doublons tout en gardant l'ordre
            seen_lemmas = set()
            unique_lemmas = []
            for lemma in french_lemmas:
                if lemma not in seen_lemmas:
                    seen_lemmas.add(lemma)
                    unique_lemmas.append(lemma)

            for sense_number, lemma in enumerate(unique_lemmas, 1):
                # Nettoyer le lemma des caractères problématiques
                clean_lemma = (
                    lemma.replace("\t", " ").replace("\n", " ").replace("\r", " ")
                )
                f.write(f"{synset_id}\t{clean_lemma}\tfra\t{sense_number}\n")
                total_senses += 1

    print(f"✓ {total_senses} senses exportés")
    return total_senses


def export_relations(
    french_synsets: Set[str], synset_objects: Dict[str, object], output_dir: str
) -> int:
    """
    Exporte le fichier relations.tab avec un maximum de relations WordNet.

    On inclut :
      - relations de synset -> synset (hypernyms, meronyms, etc.)
      - relations via les lemmes (antonyms, dérivations, pertainyms)
    """

    output_file = os.path.join(output_dir, "relations.tab")

    print(f"📝 Export des relations vers {output_file}...")

    # Set pour éviter les doublons de relations
    relations_set: Set[Tuple[str, str, str]] = set()

    # 1) Relations directement disponibles sur les synsets
    synset_relation_methods = [
        ("HYPERNYM", "hypernyms"),
        ("HYPONYM", "hyponyms"),
        ("INSTANCE_HYPERNYM", "instance_hypernyms"),
        ("INSTANCE_HYPONYM", "instance_hyponyms"),
        ("MEMBER_HOLONYM", "member_holonyms"),
        ("PART_HOLONYM", "part_holonyms"),
        ("SUBSTANCE_HOLONYM", "substance_holonyms"),
        ("MEMBER_MERONYM", "member_meronyms"),
        ("PART_MERONYM", "part_meronyms"),
        ("SUBSTANCE_MERONYM", "substance_meronyms"),
        ("ALSO_SEE", "also_sees"),
        ("SIMILAR_TO", "similar_tos"),
        ("ATTRIBUTE", "attributes"),
        ("ENTAILMENT", "entailments"),
        ("CAUSES", "causes"),
        ("VERB_GROUP", "verb_groups"),
        ("TOPIC_DOMAIN", "topic_domains"),
        ("REGION_DOMAIN", "region_domains"),
        ("USAGE_DOMAIN", "usage_domains"),
    ]

    for synset_id in french_synsets:
        synset = synset_objects[synset_id]

        # Relations synset -> synset
        for rel_label, method_name in synset_relation_methods:
            try:
                method = getattr(synset, method_name, None)
                if method is None:
                    continue
                for target_synset in method():
                    target_id = get_synset_id(target_synset)
                    # On ne garde que les liens entre synsets qui ont du français
                    if target_id in french_synsets:
                        relations_set.add((synset_id, rel_label, target_id))
            except Exception:
                # On ne veut pas crasher l'export sur un synset chelou
                continue

        # 2) Relations via les lemmes (antonymie, dérivation, pertainym)
        try:
            for lemma in synset.lemmas():
                # ANTONYMS (comme tu le faisais déjà)
                for antonym in lemma.antonyms():
                    target_synset = antonym.synset()
                    target_id = get_synset_id(target_synset)
                    if target_id in french_synsets:
                        relations_set.add((synset_id, "ANTONYM", target_id))

                # DÉRIVATION (nom <-> verbe <-> adjectif, etc.)
                for der in lemma.derivationally_related_forms():
                    target_synset = der.synset()
                    target_id = get_synset_id(target_synset)
                    if target_id in french_synsets:
                        relations_set.add((synset_id, "DERIVATION", target_id))

                # PERTAINYM (souvent adj -> nom de base)
                if hasattr(lemma, "pertainyms"):
                    for pert in lemma.pertainyms():
                        target_synset = pert.synset()
                        target_id = get_synset_id(target_synset)
                        if target_id in french_synsets:
                            relations_set.add((synset_id, "PERTAINYM", target_id))
        except Exception:
            continue

    # Écrire les relations triées
    relation_counts: Dict[str, int] = defaultdict(int)

    with open(output_file, "w", encoding="utf-8") as f:
        # En-tête
        f.write("synset1\trelation\tsynset2\n")

        for synset1, relation, synset2 in sorted(relations_set):
            f.write(f"{synset1}\t{relation}\t{synset2}\n")
            relation_counts[relation] += 1

    total_relations = len(relations_set)
    print(f"✓ {total_relations} relations exportées")
    for relation, count in sorted(relation_counts.items()):
        print(f"  {relation}: {count}")

    return total_relations


def main():
    """Fonction principale du script."""
    print("🚀 Export OMW-FR-1.4 vers TSV")
    print("=" * 40)

    # Télécharger les ressources NLTK si nécessaire
    download_nltk_resources()

    # Créer le dossier de sortie
    output_dir = os.path.join("data", "raw", "omw-fr-1.4")
    os.makedirs(output_dir, exist_ok=True)
    print(f"📁 Dossier de sortie: {output_dir}")

    try:
        # Filtrer les synsets français
        french_synsets, synset_objects = filter_french_synsets()

        if not french_synsets:
            print("❌ Aucun synset français trouvé. Vérifiez l'installation d'OMW-1.4.")
            return

        # Exporter les trois fichiers
        export_synsets(french_synsets, synset_objects, output_dir)
        senses_count = export_senses(french_synsets, synset_objects, output_dir)
        relations_count = export_relations(french_synsets, synset_objects, output_dir)

        # Résumé final
        print("\n" + "=" * 40)
        print("📊 RÉSUMÉ DE L'EXPORT")
        print("=" * 40)
        print(f"Synsets français retenus: {len(french_synsets)}")
        print(f"Senses exportés: {senses_count}")
        print(f"Relations exportées: {relations_count}")
        print(f"Fichiers générés dans: {output_dir}/")
        print("  - synsets.tab")
        print("  - senses.tab")
        print("  - relations.tab")
        print("\n✅ Export terminé avec succès!")

    except Exception as e:
        print(f"\n❌ Erreur lors de l'export: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
