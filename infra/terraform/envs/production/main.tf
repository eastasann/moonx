provider "google" {
  project = var.project_id
  region  = "asia-southeast1"
}

module "environment" {
  source = "../../modules/environment"

  project_id       = var.project_id
  environment      = "production"
  host             = var.domain
  mail_domain      = var.domain
  bootstrap        = var.bootstrap
  api_image        = var.api_image
  google_client_id = var.google_client_id
  sentry_dsn       = var.sentry_dsn
  web_sentry_dsn   = var.web_sentry_dsn
}

# Created by envs/shared under this display name and type.
data "google_monitoring_notification_channel" "alerts" {
  display_name = "moonx alerts"
  type         = "email"
}

# Alerts are for production only (SDD 11章). The first apply creates only the secrets,
# the service account and the bucket (ADR-015).
module "monitoring" {
  source = "../../modules/monitoring"
  count  = var.bootstrap ? 0 : 1

  project_id           = var.project_id
  service_name         = module.environment.service_name
  host                 = var.domain
  notification_channel = data.google_monitoring_notification_channel.alerts.name
  uptime_check_enabled = var.uptime_check_enabled
}
