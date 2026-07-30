# DX-Wrapper fuer OpenTofu-Umgebungen (#241, #245).
#
# Env-spezifische Werte werden aus dem aktiven Workspace abgeleitet (siehe
# env.tf) -> KEIN -var-file mehr noetig. Diese Targets waehlen den passenden
# Workspace und rufen dann tofu bzw. die Deploy-Skripte auf.
#
# Normaler Alltag:
#   make test                      # lokale Checks (Backend-Tests + FE-Typecheck)
#   make deploy ENV=staging        # bauen + deployen nach staging
#   make deploy ENV=prod        # bauen + deployen nach prod (yogaswap-prod)
#   make deploy ENV=default     # bauen + deployen nach demo (yogaswap-demo)
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

# Projektname aus Workspace (muss mit env.tf / local.env_public übereinstimmen).
# Kein `tofu console`: hält mit S3-Backend einen State-Lock und kann hängen (#274/#261).
# Einzeilig: Fortsetzungszeilen würden führendes Whitespace in den Wert ziehen.
project_name = $(if $(filter default,$(ENV)),yogaswap-demo,$(if $(filter staging,$(ENV)),yogaswap-staging,$(if $(filter prod,$(ENV)),yogaswap-prod,$(error Unbekannter ENV=$(ENV)))))

# default-tenant in der ENV anlegen (Projektname aus Workspace-Mapping).
seed-tenants: workspace
	cd $(REPO_ROOT)/backend && \
	  PROJECT_NAME="$(project_name)" \
	  npm run seed:tenants

# Tenant anlegen + bestehenden Admin verknüpfen (#53).
# Legt standardmäßig auch ein Participant-Profil an (Admin als User sichtbar).
#   make create-tenant ENV=staging TENANT=studio-x ADMIN=karin \
#     [ARGS="--name \"Studio X\""]
# Cognito-User muss bereits existieren (bootstrap-admin bzw. createAdminUser.js).
create-tenant: workspace
	cd $(REPO_ROOT)/backend && \
	  PROJECT_NAME="$(project_name)" \
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
