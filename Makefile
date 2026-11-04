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
# The service worker has its own project: the WebWorker types and the DOM's clash.
TS_PROJECTS := . $(patsubst %/tsconfig.json,%,$(wildcard apps/*/tsconfig.json packages/*/tsconfig.json e2e/tsconfig.json)) \
	apps/web/tsconfig.sw.json

require = $(if $($(1)),,$(error $(1) is required: make $@ $(1)=...))
require-project = $(if $(GCP_PROJECT_ID),,$(error No Google Cloud project: run gcloud config set project, or make $@ GCP_PROJECT_ID=...))
require-env = $(if $(and $(filter 1,$(words $(ENV))),$(filter $(1),$(ENV))),,$(error ENV must be one of: $(1)))

.PHONY: install setup env-file dev dev-api dev-web build build-web build-api-image \
	test test-domain test-api test-web test-e2e coverage first-paint lint format \
	typecheck db-up db-down db-generate db-check db-migrate db-seed db-reset \
	db-studio tokens openapi kpi doc-lint admin-create infra-plan infra-apply \
	deploy-api promote promote-check db-backup

install:
	bun install --frozen-lockfile

# Git hooks are wired right after .env, so they work even if a later step fails.
setup: install env-file
	git config core.hooksPath .githooks
	$(MAKE) db-up
	$(MAKE) db-migrate
	$(MAKE) db-seed
	$(MAKE) tokens
	$(BUNX) playwright install chromium

# CI uses it too, so tests there see the same local values as a developer's.
env-file:
	bun scripts/setup-env.ts

dev:
	$(MAKE) -j2 dev-api dev-web

dev-api:
	cd apps/api && bun --watch src/index.ts

dev-web:
	cd apps/web && $(BUNX) vite dev

# Left out of the bundle, to load from node_modules as the tests do (apps/api/Dockerfile
# installs them): sharp loads its native binary from beside its own package, and the
# pdfkit inside react-pdf requires its standard fonts by its own package's imports map
# at run time, which no bundle can resolve. React goes with react-pdf, so both use one.
API_BUNDLE = cd apps/api && bun build src/index.ts --target=bun --sourcemap=linked \
	--external=sharp --external=@react-pdf/renderer --external=react --outdir=dist

build:
	$(MAKE) typecheck
	$(MAKE) build-web
	$(API_BUNDLE)

# The debug IDs let Sentry find each script's hidden map (apps/web/vite.config.ts) by
# the script's content, so the tests run the scripts the image serves.
build-web: SHA ?= dev
build-web:
	cd apps/web && MOONX_RELEASE=$(SHA) $(BUNX) vite build
	$(BUNX) @sentry/cli sourcemaps inject apps/web/dist/client/assets >/dev/null

# Bun marks its bundle with a debug ID but not with the code Sentry's SDK reads the ID
# from, and sentry-cli leaves a marked file as it is: without the mark it injects both,
# keeping the map's ID. The image leaves every source map out (.dockerignore). The maps
# go up before the image, so that no image goes up without them; the token is an
# organization token, which names the organization (03_dev-setup.md 5.4 D).
build-api-image:
	$(call require,SHA)
	$(call require-project)
	$(if $(strip $(SENTRY_AUTH_TOKEN)),,$(error SENTRY_AUTH_TOKEN is required in the environment (SDD 2章「CI のシークレットと変数」)))
	$(MAKE) build-web SHA=$(SHA)
	$(API_BUNDLE)
	sed -i.bak '/^\/\/# debugId=/d' apps/api/dist/index.js && rm apps/api/dist/index.js.bak
	$(BUNX) @sentry/cli sourcemaps inject apps/api/dist >/dev/null
	docker build --platform=linux/amd64 --file=apps/api/Dockerfile \
		--build-arg=APP_VERSION=$(SHA) --tag=$(IMAGE):$(SHA) .
	$(BUNX) @sentry/cli sourcemaps upload --project=moonx-web --release=$(SHA) \
		apps/web/dist/client/assets
	$(BUNX) @sentry/cli sourcemaps upload --project=moonx-api --release=$(SHA) apps/api/dist
	gcloud auth configure-docker $(REGION)-docker.pkg.dev --quiet
	docker push $(IMAGE):$(SHA)

test: test-domain test-api test-web

test-domain:
	bun test --pass-with-no-tests $(TEST_COVERAGE_FLAGS) ./packages/domain ./packages/schemas \
		./packages/i18n ./packages/ui-tokens ./scripts

test-api:
	bun packages/db/src/recreate-test-database.ts
	bun test --pass-with-no-tests $(TEST_COVERAGE_FLAGS) ./apps/api ./packages/db

# SDD 10章's coverage targets: the suites above with coverage on, then each layer's own
# files against its target. The Web's Vitest checks its own (apps/web/vitest.config.ts).
coverage:
	$(MAKE) test-domain TEST_COVERAGE_FLAGS="--coverage --coverage-reporter=lcov --coverage-dir=coverage/domain"
	$(MAKE) test-api TEST_COVERAGE_FLAGS="--coverage --coverage-reporter=lcov --coverage-dir=coverage/api"
	cd apps/web && $(BUNX) vitest run --coverage
	bun scripts/coverage-check.ts

test-web:
	cd apps/web && $(BUNX) vitest run --passWithNoTests
	cd packages/ui-web && $(BUNX) vitest run --passWithNoTests

# The PWA checks run against the API serving this build (SDD 10章「PWA と配信」).
test-e2e:
	$(BUNX) playwright install chromium
	$(MAKE) build-web SHA=dev
	$(BUNX) playwright test --config=e2e/playwright.config.ts

# SDD 7.3's first display estimated on this machine, against the same build as the PWA
# checks. Its timings follow the host's CPU, so CI does not run it.
first-paint:
	$(BUNX) playwright install chromium
	$(MAKE) build-web SHA=dev
	MOONX_FIRST_PAINT=1 $(BUNX) playwright test --config=e2e/playwright.config.ts \
		--project=first-paint

# actionlint runs ShellCheck over the workflows' scripts when it is on PATH, as it is on
# GitHub's runners (03_dev-setup.md 10章).
lint:
	$(BUNX) biome check .
	bun scripts/check-screens.ts apps/web/src
	$(BUNX) actionlint

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
	bun apps/api/scripts/seed.ts

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
	$(if $(CHECK_WORKSPACE_ID),,$(error CHECK_WORKSPACE_ID is required: the ID of the workspace kept for the post-deploy checks (03_dev-setup.md 5.4 K)))
	psql "$$DATABASE_URL_DIRECT" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 \
		--set=check_workspace_id="$$CHECK_WORKSPACE_ID" --file=packages/db/queries/kpi.sql

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
	gcloud run deploy moonx-api-$(ENV) --image=$(IMAGE):$(SHA) --project=$(GCP_PROJECT_ID) \
		--region=$(REGION) --quiet

# gcloud looks for the image and, after a failed deployment, the running version.
promote:
	$(call require-env,staging production)
	$(call require-project)
	GCP_PROJECT_ID=$(GCP_PROJECT_ID) bun scripts/promote.ts $(ENV) $(SHA)

promote-check:
	$(call require,BASE)
	bun scripts/promote-check.ts $(BASE)

# The dump goes up in one request to Cloud Storage's JSON API, as the API's photos do
# (ADR-024), which takes only the permissions to create and replace an object (ADR-028).
# gcloud storage cp reads the object first, with the permission that also reads backups,
# which only the operators have (05_operation-runbook.md 6.2). The dump is written to a
# file first, so a failed one uploads nothing. The tests point STORAGE_URL elsewhere.
STORAGE_URL := https://storage.googleapis.com

db-backup:
	$(call require-env,staging production)
	$(call require-project)
	set -o errexit; dump="$$(mktemp)"; trap 'rm -f "$$dump"' EXIT; \
	pg_dump --format=custom --file="$$dump" "$$DATABASE_URL_DIRECT"; \
	token="$$(gcloud auth print-access-token)"; \
	name="$(ENV)%2F$$(date -u +%Y-%m-%d).dump"; \
	curl --fail-with-body --silent --show-error --request POST --upload-file "$$dump" \
		--header 'Content-Type: application/octet-stream' \
		--header @<(printf 'Authorization: Bearer %s\n' "$$token") \
		"$(STORAGE_URL)/upload/storage/v1/b/$(GCP_PROJECT_ID)-moonx-backups/o?uploadType=media&name=$$name"
