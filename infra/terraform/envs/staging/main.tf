provider "google" {
  project = var.project_id
  region  = "asia-southeast1"
}

module "environment" {
  source = "../../modules/environment"

  project_id       = var.project_id
  environment      = "staging"
  host             = "stg.${var.domain}"
  mail_domain      = var.domain
  bootstrap        = var.bootstrap
  api_image        = var.api_image
  google_client_id = var.google_client_id
  sentry_dsn       = var.sentry_dsn
  web_sentry_dsn   = var.web_sentry_dsn
  mail_allowlist   = var.mail_allowlist
}
