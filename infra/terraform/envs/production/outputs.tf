output "service_name" {
  description = "Cloud Run service name."
  value       = module.environment.service_name
}

output "service_url" {
  description = "Cloud Run URL (*.run.app); null while bootstrapping."
  value       = module.environment.service_url
}

output "runtime_service_account" {
  description = "Service account the API runs as."
  value       = module.environment.runtime_service_account
}

output "avatar_bucket" {
  description = "Bucket of the profile photos."
  value       = module.environment.avatar_bucket
}
