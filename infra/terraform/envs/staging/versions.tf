terraform {
  required_version = ">= 1.9, < 2.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.10"
    }
  }

  # make passes the bucket (-backend-config="bucket=<project>-tfstate"): a backend cannot read variables.
  backend "gcs" {
    prefix = "staging"
  }
}
