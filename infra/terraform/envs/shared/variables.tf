variable "project_id" {
  description = "Google Cloud project ID ({GCP_PROJECT_ID}), shared by staging and production."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "project_id must be 6 to 30 lowercase letters, digits or hyphens, start with a letter and not end with a hyphen."
  }
}

variable "billing_account_id" {
  description = "Billing account the project is linked to (gcloud billing accounts list). The budget lives on it."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account_id))
    error_message = "billing_account_id must look like 012345-6789AB-CDEF01."
  }
}

variable "alert_email" {
  description = "Mail address the alerts and budget notifications go to."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be one mail address with exactly one @."
  }
}

variable "github_repository" {
  description = "GitHub repository <org>/moonx whose main branch may enter Google Cloud (ADR-027)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be <org>/<repository>."
  }
}
