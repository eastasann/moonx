locals {
  region       = "asia-southeast1"
  service_name = "moonx-api-${var.environment}"
  origin       = "https://${var.host}"

  # Keyed by the environment variable each secret fills (SDD 2章「環境変数」).
  secrets = {
    DATABASE_URL         = "moonx-${var.environment}-database-url"
    BETTER_AUTH_SECRET   = "moonx-${var.environment}-better-auth-secret"
    GOOGLE_CLIENT_SECRET = "moonx-${var.environment}-google-client-secret"
    RESEND_API_KEY       = "moonx-${var.environment}-resend-api-key"
  }
}

# Created by envs/shared, which is applied first (03_dev-setup.md 5.4 G before I).
data "google_service_account" "deploy" {
  account_id = "moonx-deploy"
}

resource "google_service_account" "runtime" {
  account_id   = local.service_name
  display_name = "moonx API (${var.environment})"
}

# Containers only: the values are added by hand so that the state holds none
# (03_dev-setup.md 5.4 I).
resource "google_secret_manager_secret" "this" {
  for_each = local.secrets

  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = google_secret_manager_secret.this

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_storage_bucket" "avatars" {
  name                        = "${var.project_id}-moonx-${var.environment}-avatars"
  location                    = local.region
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"

  # A removed photo, or the photo of a deleted account, is gone at once.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
}

# ADR-024: anyone may read an object, nobody may list. roles/storage.objectViewer would
# also allow listing and defeat the unguessable random names.
resource "google_storage_bucket_iam_member" "avatars_public" {
  bucket = google_storage_bucket.avatars.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

# ADR-024: the API uploads to random names (uploadType=media) and deletes by name, nothing else.
resource "google_project_iam_custom_role" "avatar_writer" {
  role_id     = "moonxAvatarWriter${title(var.environment)}"
  title       = "moonx avatar writer (${var.environment})"
  permissions = ["storage.objects.create", "storage.objects.delete"]
}

resource "google_storage_bucket_iam_member" "avatars_runtime" {
  bucket = google_storage_bucket.avatars.name
  role   = google_project_iam_custom_role.avatar_writer.id
  member = google_service_account.runtime.member
}

resource "google_cloud_run_v2_service" "api" {
  count = var.bootstrap ? 0 : 1

  name     = local.service_name
  location = local.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  # ADR-007
  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 40
    timeout                          = "60s"

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = var.api_image

      ports {
        container_port = 8080
      }

      # CPU only during requests (ADR-007); the startup boost shortens a start from zero
      # instances (SDD 7.3).
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # Cloud Run sets PORT; the image sets WEB_DIST_DIR and APP_VERSION (SDD 2章「環境変数」).
      env {
        name  = "APP_ENV"
        value = var.environment
      }
      env {
        name  = "BETTER_AUTH_URL"
        value = local.origin
      }
      env {
        name  = "TRUSTED_ORIGINS"
        value = local.origin
      }
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }
      env {
        name  = "MAIL_TRANSPORT"
        value = "resend"
      }
      env {
        name  = "MAIL_FROM"
        value = "moonx <no-reply@${var.mail_domain}>"
      }
      env {
        name  = "AVATAR_BUCKET"
        value = google_storage_bucket.avatars.name
      }
      env {
        name  = "SENTRY_DSN"
        value = var.sentry_dsn
      }
      env {
        name  = "WEB_SENTRY_DSN"
        value = var.web_sentry_dsn
      }
      env {
        name  = "LOG_LEVEL"
        value = "info"
      }

      dynamic "env" {
        for_each = var.mail_allowlist == null ? [] : [join(",", var.mail_allowlist)]

        content {
          name  = "MAIL_ALLOWLIST"
          value = env.value
        }
      }

      # 05_operation-runbook.md 3.14 relies on latest.
      dynamic "env" {
        for_each = google_secret_manager_secret.this

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    # ADR-015: CI deploys the images and people move the traffic in an emergency
    # (04_deployment-procedure.md 5.2). gcloud run deploy also writes client and
    # client_version, and labels each revision it makes with a nonce
    # (client.knative.dev/nonce): removing that label would make a new revision.
    ignore_changes = [
      template[0].containers[0].image,
      template[0].labels,
      traffic,
      client,
      client_version,
    ]

    precondition {
      condition     = var.api_image != ""
      error_message = "api_image is empty. With bootstrap = false, set it to the first image build.yml pushed (03_dev-setup.md 5.4 I step 5)."
    }
  }

  # The first revision reads the secrets as it starts.
  depends_on = [google_secret_manager_secret_iam_member.runtime]
}

# ADR-004: Cloud Run has no IAM authentication.
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count = var.bootstrap ? 0 : 1

  name     = google_cloud_run_v2_service.api[0].name
  location = google_cloud_run_v2_service.api[0].location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# deploy.yml runs gcloud run deploy as the deploy account, and a revision runs as the
# runtime account.
resource "google_cloud_run_v2_service_iam_member" "deploy_developer" {
  count = var.bootstrap ? 0 : 1

  name     = google_cloud_run_v2_service.api[0].name
  location = google_cloud_run_v2_service.api[0].location
  role     = "roles/run.developer"
  member   = data.google_service_account.deploy.member
}

resource "google_service_account_iam_member" "deploy_act_as_runtime" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = data.google_service_account.deploy.member
}

# The DNS record stays a manual CNAME in Vercel (ADR-015, 03_dev-setup.md 5.4 J).
resource "google_cloud_run_domain_mapping" "web" {
  count = var.bootstrap ? 0 : 1

  location = local.region
  name     = var.host

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.api[0].name
  }
}
