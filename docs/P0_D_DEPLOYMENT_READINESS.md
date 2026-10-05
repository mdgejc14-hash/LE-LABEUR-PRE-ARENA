# LE LABEUR — P0-D — readiness de déploiement

État vérifié le **2026-10-05** : **PREPARED / Cloudflare UNAVAILABLE**.
Aucun déploiement distant n'a été exécuté et aucune ressource distante n'est revendiquée.

## Vérifications exécutées

- `npx wrangler whoami` : commande exécutée, réponse **“You are not authenticated”**.
- `npx wrangler deploy --dry-run --env production` : validation/bundle local uniquement.
- configuration production fail-closed : `PERSISTENCE=postgres`, mais aucun binding
  `HYPERDRIVE` n'est activé tant qu'un ID réel n'existe pas ; `/healthz` répondrait
  donc `503 degraded`, `configured=false`, sans ouvrir de persistance implicite.
- les migrations 0001 → 0003 sont exécutées deux fois sur PostgreSQL local réel ;
  l'ordre, l'idempotence et les checksums sont contrôlés.
- aucun secret n'est attendu dans Git ou dans une variable `VITE_*`.

## Ressources/secrets attendus en production

1. Une base PostgreSQL distante réellement provisionnée, avec TLS et sauvegardes.
2. Un Hyperdrive `lelabeur-prod` créé avec le cache désactivé, car identité,
   sessions et RBAC exigent du read-after-write frais.
3. L'ID réel retourné par Cloudflare dans `[[env.production.hyperdrive]]` avec
   `binding = "HYPERDRIVE"`. Ne jamais inventer ni committer une valeur factice.
4. Une authentification Wrangler valide (`wrangler login` ou API token fourni
   hors Git par l'environnement CI). Aucun credential Cloudflare n'est disponible ici.
5. La valeur publique `GOOGLE_CLIENT_ID` de production (variable, pas secret),
   avec les origines autorisées configurées côté Google.

Le mot de passe PostgreSQL est fourni à Cloudflare lors de la création Hyperdrive ;
il ne va ni dans `wrangler.toml`, ni dans `VITE_*`. Le repli
`POSTGRES_CONNECTION_STRING` reste réservé au dépannage explicite et n'est pas
nécessaire au chemin de production nominal.

## Procédure restante (à exécuter seulement avec les ressources réelles)

```bash
npx wrangler whoami
npx wrangler hyperdrive create lelabeur-prod \
  --connection-string="$PRODUCTION_DATABASE_URL" --caching-disabled=true
# Ajouter l'ID RÉEL au bloc [[env.production.hyperdrive]] de wrangler.toml.
MIGRATION_DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run migrate -- --status
MIGRATION_DATABASE_URL="$PRODUCTION_DATABASE_URL" npm run migrate
npm run deploy:worker
curl --fail-with-body https://<worker-reel>/healthz
```

Avant déploiement, sauvegarder la base et vérifier que `--status` ne signale
aucun checksum divergent. Après déploiement, `/healthz` n'est prêt (`200 ok`) que
si la configuration est valide, la base est joignable et les trois migrations
sont appliquées. Ne pas contourner un `503`.
