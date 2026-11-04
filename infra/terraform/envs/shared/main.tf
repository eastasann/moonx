provider "google" {
  project = var.project_id
  region  = "asia-southeast1"

  # The Billing Budgets API needs a quota project when called with user credentials.
  user_project_override = true
  billing_project       = var.project_id
}

locals {
  region = "asia-southeast1"
}

data "google_project" "this" {}

resource "google_artifact_registry_repository" "moonx" {
  repository_id          = "moonx"
  location               = local.region
  format                 = "DOCKER"
  cleanup_policy_dry_run = false

  # ADR-007: keep the latest 30 images and anything within 90 days, delete the rest.
  # A version that matches a KEEP policy is never deleted.
  cleanup_policies {
    id     = "keep-latest-30"
    action = "KEEP"

    most_recent_versions {
      keep_count = 30
    }
  }

  cleanup_policies {
    id     = "delete-older-than-90-days"
    action = "DELETE"

    condition {
      tag_state  = "ANY"
      older_than = "7776000s"
    }
  }
}

resource "google_storage_bucket" "backups" {
  name                        = "${var.project_id}-moonx-backups"
  location                    = local.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  # ADR-028
  lifecycle_rule {
    condition {
      age = 30
    }

    action {
      type = "Delete"
    }
  }

  # SDD 7.2「個人情報」: deleted information leaves the backups within 30 days. Soft delete
  # would keep a deleted dump 7 more days.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
}

# make db-backup uploads with the JSON API, which needs create, and delete to replace the
# day's <date>.dump when db-backup.yml runs again that day (05_operation-runbook.md 3.14).
# get and list are left out, so only the operators can read the backups (05 6.2).
resource "google_project_iam_custom_role" "backup_writer" {
  role_id     = "moonxBackupWriter"
  title       = "moonx backup writer"
  permissions = ["storage.objects.create", "storage.objects.delete"]
}

resource "google_storage_bucket_iam_member" "backups_deploy" {
  bucket = google_storage_bucket.backups.name
  role   = google_project_iam_custom_role.backup_writer.id
  member = google_service_account.deploy.member
}

# ADR-027
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  # 03_dev-setup.md 5.4 G checks this exact string.
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.ref == 'refs/heads/main'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  account_id   = "moonx-deploy"
  display_name = "moonx deploy (GitHub Actions)"
}

resource "google_service_account_iam_member" "deploy_workload_identity" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# build.yml pushes the images; deploy.yml looks them up.
resource "google_artifact_registry_repository_iam_member" "deploy_writer" {
  location   = google_artifact_registry_repository.moonx.location
  repository = google_artifact_registry_repository.moonx.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deploy.member
}

# envs/production finds this channel by its display name and type: change them together.
resource "google_monitoring_notification_channel" "email" {
  display_name = "moonx alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

resource "google_billing_budget" "monthly" {
  billing_account = var.billing_account_id
  display_name    = "moonx monthly"

  budget_filter {
    projects = ["projects/${data.google_project.this.number}"]
  }

  # The currency must be the billing account's: the Budget API rejects any other.
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "10"
    }
  }

  # SDD 11章: mail at $5 and $10.
  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = [google_monitoring_notification_channel.email.name]
  }
}
