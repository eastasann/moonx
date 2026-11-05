output "workload_identity_provider" {
  description = "Value of the repository variable GCP_WORKLOAD_IDENTITY_PROVIDER (03_dev-setup.md 5.4 H)."
  value       = google_iam_workload_identity_pool_provider.github_actions.name
}

output "deploy_service_account" {
  description = "Value of the repository variable GCP_DEPLOY_SERVICE_ACCOUNT (03_dev-setup.md 5.4 H)."
  value       = google_service_account.deploy.email
}

output "artifact_registry_repository" {
  description = "Docker path of the repository; the images are <this>/api:<commit SHA>."
  value       = google_artifact_registry_repository.moonx.registry_uri
}

output "backup_bucket" {
  description = "Bucket of the daily DB dumps (ADR-028)."
  value       = google_storage_bucket.backups.name
}

output "deploy_record_bucket" {
  description = "Bucket of deploy.yml's records, which make promote reads (ADR-016)."
  value       = google_storage_bucket.deploys.name
}

output "notification_channel" {
  description = "Mail channel of the alerts and the budget."
  value       = google_monitoring_notification_channel.email.name
}
