# SDD 11章. Every alert mails the channel of envs/shared.

locals {
  # Monitoring filters name the monitored resource's labels resource.label. Log queries
  # follow the LogEntry fields, resource.labels, and reject resource.label as undefined.
  resource_filter     = "resource.type = \"cloud_run_revision\" AND resource.label.service_name = \"${var.service_name}\""
  log_resource_filter = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${var.service_name}\""
  request_logs        = "log_name = \"projects/${var.project_id}/logs/run.googleapis.com%2Frequests\""

  documentation = "Follow docs/05_operation-runbook.md chapter 2."
}

resource "google_logging_metric" "requests" {
  name   = "${var.service_name}-requests"
  filter = "${local.request_logs} AND ${local.log_resource_filter}"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "server_errors" {
  name   = "${var.service_name}-5xx"
  filter = "${local.request_logs} AND ${local.log_resource_filter} AND httpRequest.status >= 500"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "error_rate" {
  display_name          = "${var.service_name} error rate"
  combiner              = "OR"
  notification_channels = [var.notification_channel]

  documentation {
    content = local.documentation
  }

  conditions {
    display_name = "5xx over 1% of the requests in 10 minutes"

    condition_threshold {
      filter             = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.server_errors.name}\" AND ${local.resource_filter}"
      denominator_filter = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.requests.name}\" AND ${local.resource_filter}"
      comparison         = "COMPARISON_GT"
      threshold_value    = 0.01
      duration           = "0s"

      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      denominator_aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  conditions {
    display_name = "More than 5 5xx in 5 minutes"

    condition_threshold {
      filter          = "metric.type = \"logging.googleapis.com/user/${google_logging_metric.server_errors.name}\" AND ${local.resource_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "latency" {
  display_name          = "${var.service_name} latency"
  combiner              = "OR"
  notification_channels = [var.notification_channel]

  documentation {
    content = local.documentation
  }

  conditions {
    display_name = "Request p95 over 3 s for 15 minutes"

    condition_threshold {
      filter          = "metric.type = \"run.googleapis.com/request_latencies\" AND ${local.resource_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = 3000
      duration        = "900s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "memory" {
  display_name          = "${var.service_name} memory"
  combiner              = "OR"
  notification_channels = [var.notification_channel]

  documentation {
    content = local.documentation
  }

  conditions {
    display_name = "Memory over 90% for 5 minutes"

    condition_threshold {
      filter          = "metric.type = \"run.googleapis.com/container/memory/utilizations\" AND ${local.resource_filter}"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.9
      duration        = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_99"
        cross_series_reducer = "REDUCE_MAX"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "instances" {
  display_name          = "${var.service_name} instances"
  combiner              = "OR"
  notification_channels = [var.notification_channel]

  documentation {
    content = local.documentation
  }

  conditions {
    display_name = "At the maximum of 3 instances for 10 minutes"

    # The maximum holds per revision: during a deploy the old and the new one count apart.
    condition_threshold {
      filter          = "metric.type = \"run.googleapis.com/container/instance_count\" AND ${local.resource_filter}"
      comparison      = "COMPARISON_GE"
      threshold_value = 3
      duration        = "600s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.revision_name"]
      }
    }
  }
}

# Off until the domain's certificate exists, since the check fails before that
# (03_dev-setup.md 5.4 I-6, J).
resource "google_monitoring_uptime_check_config" "health" {
  count = var.uptime_check_enabled ? 1 : 0

  display_name     = "${var.service_name} health"
  period           = "300s"
  timeout          = "10s"
  selected_regions = ["ASIA_PACIFIC", "EUROPE", "USA_OREGON"]

  http_check {
    request_method = "GET"
    path           = "/api/health"
    port           = 443
    use_ssl        = true
    validate_ssl   = true

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.host
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  count = var.uptime_check_enabled ? 1 : 0

  display_name          = "${var.service_name} uptime"
  combiner              = "OR"
  notification_channels = [var.notification_channel]

  documentation {
    content = local.documentation
  }

  conditions {
    display_name = "Health check failing in two or more regions for 5 minutes"

    condition_threshold {
      filter          = "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id = \"${google_monitoring_uptime_check_config.health[0].uptime_check_id}\" AND resource.type = \"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }
}
