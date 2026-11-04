variable "project_id" {
  description = "Google Cloud project ID ({GCP_PROJECT_ID}). Prefixes the bucket name and is the domain mapping's namespace."
  type        = string
}

variable "environment" {
  description = "Environment name, used as is in the resource names (SDD 2章「環境と命名」)."
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "host" {
  description = "Public host of the Web and the API: stg.{DOMAIN} on staging, {DOMAIN} on production."
  type        = string
}

variable "mail_domain" {
  description = "{DOMAIN}. Both environments send from no-reply@ this domain (SDD 2章「環境変数」 MAIL_FROM)."
  type        = string
}

variable "bootstrap" {
  description = "True on the first apply: creates only the secret containers, the service account and the avatar bucket, not Cloud Run or the domain mapping (ADR-015)."
  type        = bool
}

variable "api_image" {
  description = "Image of the first Cloud Run revision, required once bootstrap is false. Later images come from CI and are ignored here (ADR-015)."
  type        = string
  default     = ""
}

variable "google_client_id" {
  description = "GOOGLE_CLIENT_ID: the OAuth client of this environment."
  type        = string
}

variable "sentry_dsn" {
  description = "SENTRY_DSN: Sentry project moonx-api."
  type        = string
}

variable "web_sentry_dsn" {
  description = "WEB_SENTRY_DSN: Sentry project moonx-web, handed to the Web in the HTML (ADR-004)."
  type        = string
}

variable "mail_allowlist" {
  description = "MAIL_ALLOWLIST: the only recipients staging mails (ADR-013). Null leaves the variable unset; only staging passes it."
  type        = list(string)
  default     = null
}
