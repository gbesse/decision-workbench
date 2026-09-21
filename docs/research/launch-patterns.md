# Ce que les premiers outils LLM enseignent pour Jev

Étude de cas réalisée le 21 septembre 2026 pour choisir les prochaines extensions de Decision Workbench. Elle compare huit projets, leurs premières propositions de valeur documentées et leur situation GitHub actuelle. Les recommandations sont des hypothèses produit à tester, pas des garanties de domination.

## Méthode et limites

J'ai consulté les README à des commits de 2022–2023, puis relevé les métadonnées GitHub actuelles : création du dépôt, étoiles, forks, archivage et licence détectée. Les liens historiques sont figés dans [early-readme-sources.json](early-readme-sources.json) et les chiffres datés dans [github-launch-snapshot.json](github-launch-snapshot.json).

Les dates de création des dépôts ne sont pas nécessairement les dates de lancement public. Les étoiles actuelles ne donnent ni la vitesse de croissance initiale, ni le nombre d'utilisateurs actifs, ni le revenu. Cette sélection privilégie volontairement des projets visibles : elle a un biais de survivance et ne permet pas d'estimer la probabilité de succès d'un nouveau dépôt. Aucune courbe historique d'étoiles n'a été reconstruite.

LangChain et GPT Index existaient déjà avant la fin de novembre 2022. Leur succès ne peut donc pas être décrit simplement comme celui de produits créés après ChatGPT. Open WebUI et CrewAI appartiennent à une vague plus tardive de 2023. Cette distinction évite de confondre plusieurs fenêtres d'opportunité.

## Huit cas comparés

| Projet                 | Création du dépôt | Étoiles au relevé | Promesse dans le README historique                                 | Transposition possible                                          |
| ---------------------- | ----------------- | ----------------: | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| LangChain              | 17/10/2022        |           146 784 | Composer appels de modèles, données et outils                      | Un contrat commun entre décisions, sources et actions           |
| GPT Index / LlamaIndex | 02/11/2022        |            52 258 | Relier des données externes aux LLM malgré les limites de contexte | Des extracteurs qui conservent l'origine des champs             |
| Langflow               | 08/02/2023        |           155 085 | Une interface pour manipuler les composants LangChain              | Un résultat utilisable avant d'écrire un SDK                    |
| AutoGPT                | 16/03/2023        |           187 472 | Montrer une boucle agentique autonome avec GPT-4                   | Une démonstration mémorable, accompagnée de limites observables |
| Flowise                | 31/03/2023        |            55 471 | Composer visuellement des flux LangChainJS                         | Installation courte, exemples et composants réutilisables       |
| Dify                   | 12/04/2023        |           156 713 | Concevoir une application puis l'exposer comme site ou API         | Relier édition, exécution, observation et amélioration          |
| Open WebUI             | 06/10/2023        |           152 691 | Donner une interface familière aux modèles Ollama                  | S'appuyer sur une habitude existante, simplifier l'accès        |
| CrewAI                 | 27/10/2023        |            58 853 | Composer rôles, tâches et processus d'agents                       | Une abstraction explicite pour organiser plusieurs étapes       |

Sources primaires des promesses initiales : [LangChain, décembre 2022](https://github.com/langchain-ai/langchain/blob/d95b39d37f9b15440cd87e97df7132699f69c8ab/README.md), [GPT Index, décembre 2022](https://github.com/run-llama/llama_index/blob/3f9d72acd721c1768a675899ea88297829145a5f/README.md), [Langflow, avril 2023](https://github.com/langflow-ai/langflow/blob/2b6f70fdb4f0238b2cf6afdb6473a764e090060f/README.md), [AutoGPT, avril 2023](https://github.com/Significant-Gravitas/AutoGPT/blob/c317cf0e75d70c3b38eebe4b1a4855f9a28789d9/README.md), [Flowise, mai 2023](https://github.com/FlowiseAI/Flowise/blob/5af2c3ba7b7671657e01390b411b243bba4f36de/README.md), [Dify, mai 2023](https://github.com/langgenius/dify/blob/490858a4d53f6206698ab90888f0f71b34b8e295/README.md), [Open WebUI, novembre 2023](https://github.com/open-webui/open-webui/blob/b55ec6ce49d5505b806421ceffc514886ebc47a8/README.md), [CrewAI, décembre 2023](https://github.com/crewAIInc/crewAI/blob/fddeb0e6723ca72bead7b45cbc8eaa93fd387fc4/README.md).

La popularité ne garantit pas la pérennité : [Flowise est archivé depuis août 2026](https://github.com/FlowiseAI/Flowise). Cela ne prouve pas une disparition de ses utilisateurs, mais interdit de présenter ses étoiles comme une position inexpugnable. Les licences détectées ne sont pas toutes MIT ; `NOASSERTION` signifie que GitHub n'a pas fourni de classification SPDX exploitable. Aucune conclusion juridique sur ces licences n'est tirée ici.

## Ce que nous pouvons reprendre

**Une tâche compréhensible avant une architecture.** Les premiers README de Flowise et Langflow permettaient de comprendre rapidement ce que l'on allait manipuler. Pour Jev, le premier parcours doit rester « importer vingt demandes, vérifier les décisions, corriger, exporter ». Mesure proposée : temps entre installation et première décision inspectée.

**Une interface peut distribuer une infrastructure.** Le GUI initial de Langflow s'appuyait sur LangChain ; Open WebUI rendait Ollama accessible dans un navigateur. Notre interface peut distribuer DecisionPacks, StateBridge et Agent Capsule, à condition que les exports restent réellement réutilisables. Mesure proposée : nombre d'applications distinctes utilisant le même contrat.

**L'accumulation utile vient des intégrations et des corrections.** Les connecteurs du premier GPT Index et les fonctions d'exploitation décrites par Dify suggèrent une voie : conserver mappings, exemples validés et traces suffisamment stables pour qu'une équipe revienne les utiliser. C'est une inférence produit, pas une preuve causale du succès de ces projets. Mesures proposées : réutilisation d'un mapping, répétition d'un traitement, proportion de corrections réemployées.

**Une démonstration agentique doit déboucher sur une tâche fiable.** AutoGPT mettait explicitement en avant une expérience autonome. Notre avantage potentiel est plus précis : plusieurs actions, leurs entrées inspectables, un accord par action et un rejeu sans répéter les effets. Mesure proposée : workflows terminés avec une trace exploitable, plutôt que nombre de démonstrations vues.

## Priorités et critères de décision

| Priorité | Extension                                                    | Preuve attendue avant d'élargir                                                                          |
| -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1        | Constructeur visuel de formulaires liés aux politiques       | Un développeur configure puis réutilise un formulaire sans modifier le code                              |
| 2        | Séquences JSON avec passage de résultats et validations      | Un workflow à deux actions reprend après redémarrage sans répéter la première                            |
| 3        | Extracteurs pour les documents réellement demandés           | Trois équipes différentes réutilisent le même extracteur et ses preuves d'origine                        |
| 4        | Catalogue public d'extensions avec versions et compatibilité | Plusieurs auteurs indépendants soumettent des plugins maintenus ; l'installation vérifie les dépendances |
| 5        | Addons profonds pour les hôtes déjà ciblés                   | Installation et tâche complète vérifiées dans les versions réelles des hôtes                             |
| 6        | Migration depuis des outils visuels existants                | Demandes concrètes portant sur des flux exportables et une sémantique compatible                         |

Les deux premières extensions sont implémentées dans cette itération. Les autres restent un backlog explicite. Il n'y a pas encore de marketplace publique, d'OCR universel ni de suite certifiant tous les addons en conditions réelles.

L'archivage de Flowise mérite une exploration de besoins de migration, mais pas un convertisseur aveugle : ses chaînes LLM et les décisions finies de Jev ont des sémantiques différentes. Un premier import devrait annoncer les nœuds reconnus, refuser les autres et préserver les données originales.

## Construire une position durable

L'hypothèse la plus forte est de devenir le lieu où une décision est définie, validée, présentée et réutilisée dans plusieurs systèmes. La valeur accumulée serait constituée de contrats stables, d'exemples étiquetés, de mappings, d'intégrations et de mainteneurs. Elle dépend de leur usage réel.

Les données privées restent chez leurs propriétaires. Un catalogue partagé ne doit recevoir que des exemples et extensions explicitement publiés. Aucun verrouillage artificiel, aucune collecte cachée et aucune croissance garantie ne sont nécessaires à cette stratégie : la difficulté à remplacer le produit doit venir de son utilité et de la qualité de son écosystème.
