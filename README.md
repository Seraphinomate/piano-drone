# Piano Drone

App web perso : encoder des accords au clavier (voicings exacts), un bourdon (drone) tenu,
et des suites d'accords jouées par-dessus, synchronisées entre appareils.

- `public/index.html` — l'app (tout en un fichier)
- `src/worker.js` — Worker Cloudflare : sert l'app + `/api/sync` (bibliothèque des suites)
- `wrangler.toml` — configuration (nom, fichiers, base KV)

## Mise en place sur Cloudflare (une seule fois)

1. **Base de données** — Tableau de bord → *Storage & Databases* → *Workers KV* → *Create* →
   nom `piano-drone-lib`. Copier son **ID** et le mettre dans `wrangler.toml` (`id = "…"`).
2. **Relier le dépôt** — *Workers & Pages* → *Create* → *Import a repository* → choisir
   `piano-drone`. Laisser la commande de déploiement par défaut (`npx wrangler deploy`).
   Le nom du Worker doit être `piano-drone-app` (comme dans wrangler.toml).
3. **Code d'accès** — dans le Worker : *Settings* → *Variables and Secrets* → *Add* →
   type **Secret**, nom `ACCESS_CODE`, valeur = ton code. Enregistrer / redéployer.

Ensuite, chaque modification poussée sur la branche principale est déployée automatiquement.

## Tester en local

```sh
echo 'ACCESS_CODE="test"' > .dev.vars
npx wrangler dev
```
