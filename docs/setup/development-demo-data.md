# Development demo data

The development demo seed is the long-lived local dataset for exercising
ZuriDesk as the product grows. It is intentionally separate from migration
fixtures and integration-test setup. Future phases should extend this dataset
instead of creating unrelated login credentials or one-off local records.

All names, emails, services and prices in this dataset are synthetic. They are
product-development fixtures, not customer data or market claims.

## Safety contract

The command refuses to run unless all of these conditions are true:

- `ZURIDESK_ALLOW_DEMO_SEED=true` is explicitly set;
- `NODE_ENV` is not `production`;
- `MONGODB_DB_NAME` starts with `zuridesk_dev` or `zuridesk_test`;
- every registered database migration is already applied;
- `ZURIDESK_DEMO_PASSWORD` satisfies the normal password policy and is not the
  checked-in placeholder.

The password belongs only in `.env.local` or an approved local secret store. It
is hashed with the production Argon2id policy, never written to the database in
plain text and never printed by the seed command.

## Run it

Start the local replica set, configure `.env.local`, apply migrations and seed:

```bash
docker compose -f infra/compose.mongo.yml up --detach --wait
pnpm db:migrate
pnpm db:seed:demo
```

Minimum local seed settings:

```dotenv
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=zuridesk_dev
ZURIDESK_ALLOW_DEMO_SEED=true
ZURIDESK_DEMO_PASSWORD=<local-only password of at least 12 characters>
```

## Login personas

Every account uses the local `ZURIDESK_DEMO_PASSWORD` value.

| Persona      | Email                             | Role         | Demo purpose                         |
| ------------ | --------------------------------- | ------------ | ------------------------------------ |
| Owner        | `owner@demo.zuridesk.example`     | owner        | Tenant-wide setup and administration |
| Manager      | `manager@demo.zuridesk.example`   | manager      | Location-scoped management           |
| Receptionist | `reception@demo.zuridesk.example` | receptionist | Front-desk booking workflows         |
| Stylist A    | `stylist.a@demo.zuridesk.example` | stylist      | Inherited location schedule          |
| Stylist B    | `stylist.b@demo.zuridesk.example` | stylist      | Custom split-shift schedule          |

The current dataset creates one synthetic parlour, one Nairobi location, three
services, two staff booking profiles, location grants, staff assignments,
service eligibility, offerings and effective-dated weekly schedules. Re-running
the command converges those records to the checked-in fixture and revokes local
sessions for the demo users so password changes take effect immediately.

## Extending it in future phases

Keep these rules when adding new demo records:

1. Add a stable ObjectId under `DEVELOPMENT_DEMO_IDS`; do not use runtime-random
   identifiers for durable demo entities.
2. Keep tenant-owned records under the demo tenant and preserve tenant-prefixed
   indexes and repository invariants.
3. Use `.example` emails and synthetic names, phones, notes and prices only.
4. Make reruns converge safely. Never delete records outside the stable demo IDs
   or explicit `@demo.zuridesk.example` namespace.
5. Add unit safety coverage and real-Mongo idempotency/invariant coverage for
   every new phase's data.
6. Increment `DEVELOPMENT_DEMO_DATASET_VERSION` when the fixture contract changes
   in a way developers need to notice.
