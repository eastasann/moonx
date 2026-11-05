output "service_name" {
  description = "Cloud Run service name, known before the service exists."
  value       = local.service_name
}

output "service_url" {
  description = "Cloud Run URL (*.run.app); null while bootstrapping."
  value       = one(google_cloud_run_v2_service.api[*].uri)
}

output "runtime_service_account" {
  description = "Service account the API runs as."
  value       = google_service_account.runtime.email
}

output "avatar_bucket" {
  description = "Bucket of the profile photos (AVATAR_BUCKET)."
  value       = google_storage_bucket.avatars.name
}
