# Single source of the real commands (SDD 2, ADR-017). Docs and CI refer to target names only.
# Values in .env must be written without quotes: make passes them to every command as-is.
-include .env
.EXPORT_ALL_VARIABLES:

SHELL := /bin/bash
GCP_REGION := asia-southeast1
REGISTRY = $(GCP_REGION)-docker.pkg.dev/$(GCP_PROJECT_ID)/moonx
EAS_ENV_staging := preview
EAS_ENV_production := production
BACKUP_DATE = $(shell date -u +%Y-%m-%d)

.PHONY: install setup dev dev-api dev-web dev-mobile build build-web build-api-image \
	test test-domain test-api test-web test-mobile test-e2e lint format typecheck \
	db-up db-down db-generate db-migrate db-seed db-reset db-studio tokens openapi doc-lint \
	cron-due admin-create infra-plan infra-apply deploy-api deploy-web mobile-update mobile-build db-backup

require-%:
	@test -n "$($*)" || { echo "$* is required (example: make $(MAKECMDGOALS) $*=...)" >&2; exit 2; }

install:
	bun install --frozen-lockfile

setup: install
	@test -f .env || cp .env.example .env
	@test -f apps/mobile/.env || cp apps/mobile/.env.example apps/mobile/.env
	$(MAKE) db-up
	$(MAKE) db-migrate
	$(MAKE) db-seed
	$(MAKE) tokens
	bunx playwright install chromium
	git config core.hooksPath .githooks

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	bun run --cwd apps/api dev

dev-web:
	bun run --cwd apps/web dev

dev-mobile:
	bun run --cwd apps/mobile dev

build: typecheck
	bun run --cwd apps/web build

build-web: require-ENV
	VITE_APP_ENV=$(ENV) bun run --cwd apps/web build

build-api-image: require-SHA require-GCP_PROJECT_ID
	docker build -f apps/api/Dockerfile --build-arg APP_VERSION=$(SHA) -t $(REGISTRY)/api:$(SHA) .
	docker push $(REGISTRY)/api:$(SHA)

test: test-domain test-api test-web test-mobile

test-domain:
	bun test --coverage packages/domain packages/schemas packages/i18n scripts

test-api: db-up
	bun run --cwd packages/db reset-test
	DATABASE_URL=$(DATABASE_URL_TEST) bun run --cwd apps/api test

test-web:
	bun run --cwd apps/web test
	bun run --cwd packages/ui-web test

test-mobile:
	bun run --cwd apps/mobile test
	bun run --cwd packages/ui-native test

test-e2e: db-up
	bunx playwright install chromium
	DATABASE_URL=$(DATABASE_URL_TEST) bunx playwright test --config e2e/playwright.config.ts

lint:
	bunx biome check .
	bun scripts/check-screens.ts

format:
	bunx biome check --write .

typecheck:
	bun run --workspaces --if-present typecheck
	bunx tsc -p scripts/tsconfig.json

db-up:
	docker compose up -d --wait db
	@docker compose exec -T db psql -U moonx -d moonx -Atc "SELECT 1 FROM pg_database WHERE datname = 'moonx_test'" | grep -q 1 \
		|| docker compose exec -T db createdb -U moonx moonx_test

db-down:
	docker compose down

db-generate:
	bun run --cwd packages/db generate

db-migrate:
	bun run --cwd packages/db migrate

db-seed:
	bun run --cwd packages/db seed

db-reset: require-ENV-local
	docker compose down -v
	$(MAKE) db-up
	$(MAKE) db-migrate
	$(MAKE) db-seed

require-ENV-local:
	@test "$(APP_ENV)" = "local" || { echo "db-reset only runs when APP_ENV=local" >&2; exit 2; }

db-studio:
	bun run --cwd packages/db studio

tokens:
	bun run --cwd packages/ui-tokens generate

openapi:
	bun run --cwd apps/api openapi

doc-lint:
	scripts/doc-lint.sh --docs

cron-due:
	bun run --cwd apps/api cron-due

admin-create: require-EMAIL
	bun run --cwd apps/api admin-create $(EMAIL)

infra-plan: require-ENV
	cd infra/terraform/envs/$(ENV) && terraform init && terraform plan

infra-apply: require-ENV
	cd infra/terraform/envs/$(ENV) && terraform init && terraform apply

deploy-api: require-ENV require-SHA require-GCP_PROJECT_ID require-DATABASE_URL_DIRECT
	@DATABASE_URL="$(DATABASE_URL_DIRECT)" bun run --cwd packages/db migrate
	gcloud run deploy moonx-api-$(ENV) --image $(REGISTRY)/api:$(SHA) --region $(GCP_REGION) --project $(GCP_PROJECT_ID)

deploy-web: build-web
	cd apps/web && bunx wrangler deploy --env $(ENV)

mobile-update: require-ENV
	cd apps/mobile && bunx eas-cli update --channel $(ENV) --environment $(EAS_ENV_$(ENV)) --non-interactive --auto

mobile-build: require-ENV
	cd apps/mobile && bunx eas-cli build --profile $(ENV) --platform all --non-interactive --auto-submit

db-backup: require-ENV require-GCP_PROJECT_ID require-DATABASE_URL_DIRECT
	@PGDATABASE="$(DATABASE_URL_DIRECT)" pg_dump -Fc -f $(BACKUP_DATE).dump
	gcloud storage cp $(BACKUP_DATE).dump gs://$(GCP_PROJECT_ID)-moonx-backups/$(ENV)/$(BACKUP_DATE).dump
	rm -f $(BACKUP_DATE).dump
