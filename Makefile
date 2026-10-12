# The single source of truth for commands (docs/03_dev-setup.md 8章). What each target
# does is specified in docs/02-01_system-design-doc.md 2章「make ターゲット」.

# macOS ships GNU Make 3.81, which has no .SHELLFLAGS: recipes that chain commands
# set their own error handling.
SHELL := /bin/bash

# The root .env feeds every command. Variables already set in the environment or on the
# command line win, so one-off overrides such as 03_dev-setup.md 5.4 K work. Values are
# read as Bun reads them: the text inside one pair of quotes, otherwise everything before
# a `#` comment, trimmed. Make would expand a `$` and cut at a `#` where Bun keeps it, so
# lines the two would read differently stop make instead, reported by line number only
# so a secret never reaches the terminal.
ifneq ($(wildcard .env),)
# Rejected besides other line shapes: a $ anywhere, a # or backslash inside quotes, an
# unclosed quote (Bun would read on into the next lines) and backtick quotes.
ENV_FILE_BAD_LINES := $(shell { \
	grep -nvE -e '^[[:space:]]*$$' -e '^[[:space:]]*\#' -e '^[A-Za-z_][A-Za-z0-9_]*=' .env; \
	grep -nE -e '^[A-Za-z_][A-Za-z0-9_]*=.*[$$]' \
		-e '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*"[^"]*([\#\\]|$$)' \
		-e "^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*'[^']*([\#]|$$)" \
		-e '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*`' .env; \
	} | cut -d: -f1 | sort -nu)
ifneq ($(ENV_FILE_BAD_LINES),)
$(error .env line(s) $(ENV_FILE_BAD_LINES): write KEY=value, with no dollar sign, and no hash or backslash inside quotes)
endif
ENV_FILE_KEYS := $(shell sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' .env)
env-file-value = $(shell sed -n 's/^$(1)=//p' .env | tail -n 1 \
	| sed -e 's/^[[:space:]]*"\([^"]*\)".*/\1/' -e t -e "s/^[[:space:]]*'\([^']*\)'.*/\1/" -e t \
		-e 's/\#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$$//')
# The empty reference in front keeps spaces inside quotes, which make would otherwise
# strip from the start of the value.
ENV_FILE_NOTHING :=
$(foreach key,$(ENV_FILE_KEYS),$(eval $(key) ?= $$(ENV_FILE_NOTHING)$(call env-file-value,$(key))))
export $(ENV_FILE_KEYS)
endif

# Node-ecosystem CLIs run on Bun, so Node.js is not a prerequisite (03_dev-setup.md 1章).
# --no-install: a CLI missing from node_modules fails instead of being fetched unpinned,
# bypassing bun.lock.
BUNX := bun --bun x --no-install
REGION := asia-southeast1
# Recursive, so gcloud runs only for the targets that touch Google Cloud.
GCP_PROJECT_ID ?= $(shell gcloud config get-value project 2>/dev/null)
IMAGE = $(REGION)-docker.pkg.dev/$(GCP_PROJECT_ID)/moonx/api
TS_PROJECTS := . $(patsubst %/tsconfig.json,%,$(wildcard apps/*/tsconfig.json packages/*/tsconfig.json))

require = $(if $($(1)),,$(error $(1) is required: make $@ $(1)=...))
require-project = $(if $(GCP_PROJECT_ID),,$(error No Google Cloud project: run gcloud config set project, or make $@ GCP_PROJECT_ID=...))
require-env = $(if $(and $(filter 1,$(words $(ENV))),$(filter $(1),$(ENV))),,$(error ENV must be one of: $(1)))

.PHONY: install setup dev dev-api dev-web build build-web build-api-image \
	test test-domain test-api test-web test-e2e lint format typecheck \
	db-up db-down db-generate db-check db-migrate db-seed db-reset db-studio \
	tokens openapi kpi doc-lint admin-create infra-plan infra-apply deploy-api \
	promote promote-check db-backup

install:
	bun install --frozen-lockfile

# Git hooks are wired right after .env, so they work even if a later step fails.
setup: install
	bun scripts/setup-env.ts
	git config core.hooksPath .githooks
	$(MAKE) db-up
	$(MAKE) db-migrate
	$(MAKE) db-seed
	$(MAKE) tokens
	$(BUNX) playwright install chromium

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd apps/api && bun --watch src/index.ts

dev-web:
	cd apps/web && $(BUNX) vite dev

build:
	$(MAKE) typecheck
	$(MAKE) build-web
	cd apps/api && bun build src/index.ts --target=bun --sourcemap=linked --outdir=dist

build-web: SHA ?= dev
build-web:
	cd apps/web && MOONX_RELEASE=$(SHA) $(BUNX) vite build

build-api-image:
	$(call require,SHA)
	$(call require-project)
	$(MAKE) build-web SHA=$(SHA)
	cd apps/api && bun build src/index.ts --target=bun --sourcemap=linked --outdir=dist
	docker build --platform=linux/amd64 --file=apps/api/Dockerfile \
		--build-arg=APP_VERSION=$(SHA) --tag=$(IMAGE):$(SHA) .
	docker push $(IMAGE):$(SHA)
	$(BUNX) @sentry/cli sourcemaps upload --project=moonx-web --release=$(SHA) apps/web/dist/client
	$(BUNX) @sentry/cli sourcemaps upload --project=moonx-api --release=$(SHA) apps/api/dist

test: test-domain test-api test-web

test-domain:
	bun test --pass-with-no-tests ./packages/domain ./packages/schemas ./packages/i18n \
		./packages/ui-tokens ./scripts

test-api:
	bun packages/db/src/recreate-test-database.ts
	bun test --pass-with-no-tests ./apps/api ./packages/db

test-web:
	cd apps/web && $(BUNX) vitest run --passWithNoTests
	cd packages/ui-web && $(BUNX) vitest run --passWithNoTests

test-e2e:
	$(BUNX) playwright install chromium
	$(BUNX) playwright test --config=e2e/playwright.config.ts

lint:
	$(BUNX) biome check .
	bun scripts/check-screens.ts apps/web/src

format:
	$(BUNX) biome check --write --linter-enabled=false .

typecheck:
	for project in $(TS_PROJECTS); do echo "tsc -p $$project"; $(BUNX) tsc -p "$$project" || exit 1; done

db-up:
	docker compose up --detach --wait postgres

db-down:
	docker compose down

db-generate:
	cd packages/db && $(BUNX) drizzle-kit generate

db-check:
	$(call require,BASE)
	bun scripts/db-check.ts $(BASE)

# Migrations bypass the pool when a direct URL exists (SDD 2章「環境変数」). Locally the two
# are the same; in CI only DATABASE_URL_DIRECT is set.
db-migrate:
	cd packages/db && DATABASE_URL="$${DATABASE_URL_DIRECT:-$$DATABASE_URL}" $(BUNX) drizzle-kit migrate

db-seed:
	bun packages/db/src/seed.ts

# Dropping the Docker volume can only ever reach the local database, whatever
# DATABASE_URL says. The init script recreates moonx_test with it.
db-reset:
	docker compose down --volumes
	$(MAKE) db-up
	$(MAKE) db-migrate
	$(MAKE) db-seed

db-studio:
	cd packages/db && $(BUNX) drizzle-kit studio

tokens:
	bun packages/ui-tokens/scripts/generate.ts

openapi:
	bun apps/api/scripts/openapi.ts

kpi:
	$(call require-env,staging production)
	psql "$$DATABASE_URL_DIRECT" --no-psqlrc --set=ON_ERROR_STOP=1 --file=packages/db/queries/kpi.sql

doc-lint:
	scripts/doc-lint.sh --docs

admin-create:
	$(call require,EMAIL)
	bun apps/api/scripts/admin-create.ts $(EMAIL)

# The project ID itself lives in each env's Terraform variables (03_dev-setup.md 5.4);
# only the backend bucket comes from here, since a backend cannot read variables.
infra-plan:
	$(call require-env,shared staging production)
	$(call require-project)
	terraform -chdir=infra/terraform/envs/$(ENV) init -backend-config="bucket=$(GCP_PROJECT_ID)-tfstate"
	terraform -chdir=infra/terraform/envs/$(ENV) plan

infra-apply:
	$(call require-env,shared staging production)
	$(call require-project)
	terraform -chdir=infra/terraform/envs/$(ENV) init -backend-config="bucket=$(GCP_PROJECT_ID)-tfstate"
	terraform -chdir=infra/terraform/envs/$(ENV) apply

deploy-api:
	$(call require-env,staging production)
	$(call require,SHA)
	$(call require-project)
	$(MAKE) db-migrate
	gcloud run deploy moonx-api-$(ENV) --image=$(IMAGE):$(SHA) --region=$(REGION) --quiet

promote:
	$(call require-env,staging production)
	bun scripts/promote.ts $(ENV) $(SHA)

promote-check:
	$(call require,BASE)
	bun scripts/promote-check.ts $(BASE)

db-backup:
	$(call require-env,staging production)
	$(call require-project)
	set -o pipefail; pg_dump --format=custom "$$DATABASE_URL_DIRECT" \
		| gcloud storage cp - "gs://$(GCP_PROJECT_ID)-moonx-backups/$(ENV)/$$(date -u +%Y-%m-%d).dump"
