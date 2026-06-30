# DX-Wrapper fuer OpenTofu-Umgebungen (#241, #245).
#
# Env-spezifische Werte werden aus dem aktiven Workspace abgeleitet (siehe
# env.tf) -> KEIN -var-file mehr noetig. Diese Targets waehlen den passenden
# Workspace und rufen dann tofu bzw. die Deploy-Skripte auf.
#
# Normaler Alltag:
#   make test                      # lokale Checks (Backend-Tests + FE-Typecheck)
#   make deploy ENV=staging        # bauen + deployen nach staging
#   make deploy ENV=default        # bauen + deployen nach prod (yogaswap-demo)
#
# Erst-Setup einer Umgebung:
#   make bootstrap-admin ENV=staging EMAIL=admin@example.com NICKNAME=admin
#   make seed-tenants ENV=staging   # nur default-tenant (in bootstrap enthalten)
#   make create-tenant ENV=staging TENANT=studio-x ADMIN=karin  # weiterer Tenant
#
# Nur-Infra (fortgeschritten, baut KEIN Frontend):
#   make plan ENV=staging
#   make apply ENV=staging
#
# Voraussetzung pro Env: projects/yogaswap/env.<ENV>.json existiert
# (Vorlage: env.<ENV>.json.example).

ENV ?= staging
REPO_ROOT := $(abspath $(CURDIR)/../..)

.PHONY: workspace plan apply show fmt validate deploy test seed-tenants create-tenant bootstrap-admin

workspace:
	tofu workspace select $(ENV)

# Vollstaendiger Deploy (Build inkl. ENV-gekoppeltem Frontend-Modus) – der normale Weg.
deploy:
	$(REPO_ROOT)/scripts/deploy.sh $(ENV) $(ARGS)

# Schnelle lokale Checks vor dem Deploy (kein AWS).
test:
	cd $(REPO_ROOT)/backend && npm test
	cd $(REPO_ROOT)/app && npx tsc -b

# default-tenant in der ENV anlegen (Projektname aus env.tf abgeleitet).
seed-tenants: workspace
	cd $(REPO_ROOT)/backend && \
	  PROJECT_NAME=$$(cd $(CURDIR) && echo 'local.project' | tofu console 2>/dev/null | tr -d '"') \
	  npm run seed:tenants

# Tenant anlegen + bestehenden Admin verknüpfen (#53).
#   make create-tenant ENV=staging TENANT=studio-x ADMIN=karin \
#     [ARGS="--name \"Studio X\" --with-participant-profile"]
create-tenant: workspace
	cd $(REPO_ROOT)/backend && \
	  PROJECT_NAME=$$(cd $(CURDIR) && echo 'local.project' | tofu console 2>/dev/null | tr -d '"') \
	  npm run create-tenant -- --tenant "$(TENANT)" --admin-nickname "$(ADMIN)" $(ARGS)

# Ersten Admin der ENV anlegen (Gruppen + Admin-User + Tenant + Membership).
#   make bootstrap-admin ENV=staging EMAIL=admin@example.com NICKNAME=admin [PASSWORD=...]
bootstrap-admin:
	$(REPO_ROOT)/scripts/bootstrap-admin.sh $(ENV) "$(EMAIL)" "$(NICKNAME)" "$(PASSWORD)"

# --- Nur-Infra-Targets (kein Frontend-Build!) ---
plan: workspace
	tofu plan -input=false

apply: workspace
	tofu apply -input=false

show:
	@tofu workspace show

fmt:
	tofu fmt

validate:
	tofu validate
