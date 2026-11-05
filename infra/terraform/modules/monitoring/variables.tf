variable "project_id" {
  description = "Google Cloud project ID ({GCP_PROJECT_ID}), part of the Cloud Run request log's name."
  type        = string
}

variable "service_name" {
  description = "Cloud Run service the alerts watch (moonx-api-production)."
  type        = string
}

variable "host" {
  description = "Public host the uptime check opens ({DOMAIN})."
  type        = string
}

variable "notification_channel" {
  description = "Full name of the mail channel the alerts go to (projects/<project>/notificationChannels/<id>), created by envs/shared."
  type        = string
}

variable "uptime_check_enabled" {
  description = "Creates the uptime check and its alert. False until the domain's certificate exists (03_dev-setup.md 5.4 I-6, J)."
  type        = bool
}
