# DX-Wrapper fuer OpenTofu-Umgebungen (#241).
#
# Env-spezifische Werte werden aus dem aktiven Workspace abgeleitet (siehe
# env.tf) -> KEIN -var-file mehr noetig. Diese Targets waehlen nur den
# passenden Workspace und rufen dann tofu auf.
#
# Beispiele:
#   make plan ENV=staging
#   make apply ENV=staging
#   make plan ENV=default      # default = prod (yogaswap-demo / app.yogaswap.de)
#
# Voraussetzung pro Env: projects/yogaswap/env.<ENV>.json existiert
# (Vorlage: env.<ENV>.json.example).

ENV ?= staging

.PHONY: workspace plan apply show fmt validate

workspace:
	tofu workspace select $(ENV)

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
