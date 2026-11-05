variable "project_id" {
  description = "Google Cloud project ID ({GCP_PROJECT_ID}), shared by staging and production."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be 6 to 30 lowercase letters, digits or hyphens, start with a letter and not end with a hyphen."
  }
}

variable "domain" {
  description = "{DOMAIN}, for example bcdx.dwnfrc.app. Staging is served at stg.{DOMAIN}; mail goes out from no-reply@{DOMAIN}."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+(\\.[a-z0-9-]+)+$", var.domain))
    error_message = "domain must be a lowercase host name such as bcdx.dwnfrc.app, without a scheme or a path."
  }
}

variable "bootstrap" {
  description = "True on the first apply, which creates only the secret containers, the service account and the avatar bucket; false creates Cloud Run and the domain mapping (ADR-015, 03_dev-setup.md 5.4 I)."
  type        = bool
}

variable "api_image" {
  description = "Image of the first Cloud Run revision, from build.yml (03_dev-setup.md 5.4 I step 4). Required once bootstrap is false; later images come from CI."
  type        = string
  default     = ""

  validation {
    condition     = var.api_image == "" || startswith(var.api_image, "asia-southeast1-docker.pkg.dev/")
    error_message = "api_image must be empty or an image in Artifact Registry (asia-southeast1-docker.pkg.dev/...)."
  }
}

variable "google_client_id" {
  description = "GOOGLE_CLIENT_ID: the OAuth client of this environment (03_dev-setup.md 6章)."
  type        = string

  validation {
    condition     = trimspace(var.google_client_id) != ""
    error_message = "google_client_id must not be empty: the API does not start on staging without Google login."
  }
}

variable "sentry_dsn" {
  description = "SENTRY_DSN: Sentry project moonx-api."
  type        = string

  validation {
    condition     = can(regex("^https://[^/?#\\s]+(?:[/?#]\\S*)?$", var.sentry_dsn))
    error_message = "sentry_dsn must be an https URL."
  }
}

variable "web_sentry_dsn" {
  description = "WEB_SENTRY_DSN: Sentry project moonx-web, handed to the Web in the HTML (ADR-004)."
  type        = string

  # Mirrors sentryConnectSource (apps/api/src/security-headers.ts), without which the API
  # does not start. Stricter where the URL parser there is lenient: the last label starts
  # with a letter (no IPv4 hosts), and there is no percent-encoding or IDNA.
  validation {
    condition = try(
      tonumber(coalesce(regex("^(?i)https?://(?:[a-z0-9._~!$&'()*+,;=:%-]*@)?(?:[a-z0-9-]+\\.)*[a-z][a-z0-9-]*(?::([0-9]{1,5}))?(?:[/?#]\\S*)?$", var.web_sentry_dsn)[0], "0")) <= 65535,
      false,
    )
    error_message = "web_sentry_dsn must be an http or https URL whose host is letters, digits, hyphens and dots."
  }
}

variable "mail_allowlist" {
  description = "MAIL_ALLOWLIST: the only addresses staging mails (ADR-013). Empty mails nobody."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for address in var.mail_allowlist : can(regex("^[^@,\\s]+@[^@,\\s]+$", address))])
    error_message = "Each mail_allowlist entry must be one mail address: exactly one @, no comma or space (the API splits the list at commas)."
  }
}
