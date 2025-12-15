# Prometheus Metrics Endpoint Integration - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/prometheus-metrics`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Metrics Registry](#2-metrics-registry)
3. [Metric Types](#3-metric-types)
4. [Label Management](#4-label-management)
5. [Prometheus Serialization](#5-prometheus-serialization)
6. [HTTP Endpoint Handler](#6-http-endpoint-handler)
7. [LLM Metrics Collector](#7-llm-metrics-collector)
8. [Agent Metrics Collector](#8-agent-metrics-collector)
9. [Default Collectors](#9-default-collectors)
10. [Testing Support](#10-testing-support)

---

## 1. Overview

### 1.1 Pseudocode Conventions

```
FUNCTION name(param: Type) -> ReturnType
  // Comments explain intent
  VARIABLE <- expression
  IF condition THEN
    action
  END IF
  FOR EACH item IN collection DO
    process(item)
  END FOR
  RETURN value
END FUNCTION
```

### 1.2 London-School TDD Mapping

Each interface serves as a **contract** for:
1. **Production implementations** - Real metric collection
2. **Test doubles (mocks)** - Controlled metrics for testing
3. **Dependency injection** - Composable, testable architecture

---

## 2. Metrics Registry

### 2.1 Registry Interface (London-School TDD Contract)

```
TRAIT MetricsRegistry {
  FUNCTION register(collector: Collector) -> Result<(), MetricsError>
  FUNCTION unregister(collector: Collector) -> Result<(), MetricsError>
  FUNCTION gather() -> Vec<MetricFamily>
  FUNCTION counter(opts: CounterOpts) -> Counter
  FUNCTION counter_vec(opts: CounterOpts, labels: Vec<String>) -> CounterVec
  FUNCTION gauge(opts: GaugeOpts) -> Gauge
  FUNCTION gauge_vec(opts: GaugeOpts, labels: Vec<String>) -> GaugeVec
  FUNCTION histogram(opts: HistogramOpts) -> Histogram
  FUNCTION histogram_vec(opts: HistogramOpts, labels: Vec<String>) -> HistogramVec
}

STRUCT RegistryImpl {
  collectors: RwLock<HashMap<String, Collector>>,
  metrics: RwLock<HashMap<String, Metric>>,
  default_labels: HashMap<String, String>,
  cardinality_limits: HashMap<String, usize>,
  namespace: String,
  logger: Logger
}
```

### 2.2 Registry Initialization

```
FUNCTION create_registry(config: RegistryConfig) -> MetricsRegistry
  // Validate namespace format
  IF NOT is_valid_metric_name(config.namespace) THEN
    RETURN Error(MetricsError::InvalidMetricName {
      name: config.namespace,
      reason: "Namespace must match [a-zA-Z_:][a-zA-Z0-9_:]*"
    })
  END IF

  registry <- RegistryImpl {
    collectors: RwLock::new(HashMap::new()),
    metrics: RwLock::new(HashMap::new()),
    default_labels: config.default_labels,
    cardinality_limits: config.cardinality_limits,
    namespace: config.namespace,
    logger: get_logger("prometheus.registry")
  }

  // Register default collectors if enabled
  IF config.enable_process_metrics THEN
    registry.register(ProcessCollector::new())?
  END IF

  IF config.enable_runtime_metrics THEN
    registry.register(RuntimeCollector::new())?
  END IF

  RETURN Ok(registry)
END FUNCTION

STRUCT RegistryConfig {
  namespace: String,
  default_labels: HashMap<String, String>,
  cardinality_limits: HashMap<String, usize>,
  enable_process_metrics: bool,
  enable_runtime_metrics: bool
}

FUNCTION RegistryConfig::default() -> RegistryConfig
  RETURN RegistryConfig {
    namespace: "llmdevops",
    default_labels: HashMap::new(),
    cardinality_limits: HashMap::from([
      ("model", 50),
      ("provider", 20),
      ("agent_type", 100),
      ("error_type", 20)
    ]),
    enable_process_metrics: true,
    enable_runtime_metrics: true
  }
END FUNCTION
```

### 2.3 Metric Registration

```
FUNCTION registry.register(collector: Collector) -> Result<(), MetricsError>
  collector_name <- collector.describe().name

  // Check for duplicate registration
  collectors <- self.collectors.write()
  IF collectors.contains_key(collector_name) THEN
    self.logger.warn("Collector already registered", {
      name: collector_name
    })
    RETURN Error(MetricsError::DuplicateMetric { name: collector_name })
  END IF

  // Validate collector metrics
  FOR EACH metric_desc IN collector.describe().metrics DO
    validation <- validate_metric_descriptor(metric_desc)
    IF validation IS Error THEN
      RETURN validation
    END IF
  END FOR

  collectors.insert(collector_name, collector)
  self.logger.debug("Collector registered", { name: collector_name })

  RETURN Ok(())
END FUNCTION

FUNCTION registry.unregister(collector: Collector) -> Result<(), MetricsError>
  collector_name <- collector.describe().name

  collectors <- self.collectors.write()
  IF NOT collectors.contains_key(collector_name) THEN
    RETURN Error(MetricsError::CollectorNotFound { name: collector_name })
  END IF

  collectors.remove(collector_name)
  self.logger.debug("Collector unregistered", { name: collector_name })

  RETURN Ok(())
END FUNCTION
```

### 2.4 Metric Gathering

```
FUNCTION registry.gather() -> Vec<MetricFamily>
  start_time <- now()
  metric_families <- Vec::new()

  // Gather from all registered collectors
  collectors <- self.collectors.read()

  FOR EACH (name, collector) IN collectors DO
    TRY
      family <- collector.collect()

      // Apply default labels
      family <- apply_default_labels(family, self.default_labels)

      metric_families.push(family)

    CATCH CollectionError AS e
      self.logger.error("Collector failed", {
        collector: name,
        error: e.to_string()
      })
      // Continue with other collectors
    END TRY
  END FOR

  // Gather from registered metrics
  metrics <- self.metrics.read()

  FOR EACH (name, metric) IN metrics DO
    TRY
      family <- metric.collect()
      family <- apply_default_labels(family, self.default_labels)
      metric_families.push(family)
    CATCH error
      self.logger.error("Metric collection failed", {
        metric: name,
        error: error.to_string()
      })
    END TRY
  END FOR

  // Sort by metric name for consistent output
  metric_families.sort_by(|a, b| a.name.cmp(&b.name))

  duration <- now() - start_time
  self.logger.debug("Metrics gathered", {
    families: metric_families.len(),
    duration_ms: duration.as_millis()
  })

  RETURN metric_families
END FUNCTION

FUNCTION apply_default_labels(
  family: MetricFamily,
  defaults: HashMap<String, String>
) -> MetricFamily
  // Add default labels to all metrics in family
  FOR EACH metric IN family.metrics DO
    FOR EACH (key, value) IN defaults DO
      // Only add if not already present
      IF NOT metric.labels.contains_key(key) THEN
        metric.labels.insert(key, value)
      END IF
    END FOR
  END FOR

  RETURN family
END FUNCTION
```

---

## 3. Metric Types

### 3.1 Counter Implementation

```
STRUCT CounterImpl {
  name: String,
  help: String,
  value: AtomicF64,
  labels: HashMap<String, String>
}

FUNCTION registry.counter(opts: CounterOpts) -> Counter
  full_name <- format_metric_name(self.namespace, opts.subsystem, opts.name)

  // Validate name
  IF NOT is_valid_metric_name(full_name) THEN
    PANIC("Invalid counter name: {}", full_name)
  END IF

  counter <- CounterImpl {
    name: full_name,
    help: opts.help,
    value: AtomicF64::new(0.0),
    labels: HashMap::new()
  }

  // Register in metrics map
  metrics <- self.metrics.write()
  IF metrics.contains_key(full_name) THEN
    RETURN metrics.get(full_name).as_counter()
  END IF
  metrics.insert(full_name.clone(), Metric::Counter(counter.clone()))

  RETURN counter
END FUNCTION

FUNCTION counter.inc()
  self.inc_by(1.0)
END FUNCTION

FUNCTION counter.inc_by(v: f64)
  IF v < 0.0 THEN
    PANIC("Counter cannot be decreased")
  END IF

  // Atomic add
  loop {
    current <- self.value.load(Ordering::Relaxed)
    new_value <- current + v
    IF self.value.compare_exchange_weak(
      current, new_value, Ordering::Release, Ordering::Relaxed
    ).is_ok() THEN
      BREAK
    END IF
  }
END FUNCTION

FUNCTION counter.get() -> f64
  RETURN self.value.load(Ordering::Relaxed)
END FUNCTION

FUNCTION counter.collect() -> MetricFamily
  RETURN MetricFamily {
    name: self.name.clone(),
    help: self.help.clone(),
    metric_type: MetricType::Counter,
    metrics: vec![
      Metric {
        labels: self.labels.clone(),
        value: MetricValue::Counter(self.get())
      }
    ]
  }
END FUNCTION
```

### 3.2 CounterVec Implementation

```
STRUCT CounterVecImpl {
  name: String,
  help: String,
  label_names: Vec<String>,
  counters: RwLock<HashMap<Vec<String>, CounterImpl>>,
  cardinality_limit: usize
}

FUNCTION registry.counter_vec(opts: CounterOpts, labels: Vec<String>) -> CounterVec
  full_name <- format_metric_name(self.namespace, opts.subsystem, opts.name)

  // Validate label names
  FOR EACH label IN labels DO
    IF NOT is_valid_label_name(label) THEN
      PANIC("Invalid label name: {}", label)
    END IF
  END FOR

  // Get cardinality limit
  limit <- self.cardinality_limits.get(full_name)
    .or_else(|| self.cardinality_limits.get("default"))
    .unwrap_or(1000)

  counter_vec <- CounterVecImpl {
    name: full_name,
    help: opts.help,
    label_names: labels,
    counters: RwLock::new(HashMap::new()),
    cardinality_limit: limit
  }

  RETURN counter_vec
END FUNCTION

FUNCTION counter_vec.with_label_values(values: &[&str]) -> Counter
  // Validate label count
  IF values.len() != self.label_names.len() THEN
    PANIC("Label count mismatch: expected {}, got {}",
      self.label_names.len(), values.len())
  END IF

  key <- values.iter().map(|v| v.to_string()).collect::<Vec<_>>()

  // Check existing
  counters <- self.counters.read()
  IF counters.contains_key(&key) THEN
    RETURN counters.get(&key).unwrap().clone()
  END IF
  DROP counters

  // Create new counter with cardinality check
  counters <- self.counters.write()

  // Double-check after acquiring write lock
  IF counters.contains_key(&key) THEN
    RETURN counters.get(&key).unwrap().clone()
  END IF

  // Enforce cardinality limit
  IF counters.len() >= self.cardinality_limit THEN
    log_warn("Cardinality limit reached for metric", {
      metric: self.name,
      limit: self.cardinality_limit
    })
    RETURN Error(MetricsError::CardinalityExceeded {
      metric: self.name,
      limit: self.cardinality_limit
    })
  END IF

  // Build labels map
  labels <- HashMap::new()
  FOR i IN 0..self.label_names.len() DO
    labels.insert(self.label_names[i].clone(), values[i].to_string())
  END FOR

  counter <- CounterImpl {
    name: self.name.clone(),
    help: self.help.clone(),
    value: AtomicF64::new(0.0),
    labels: labels
  }

  counters.insert(key, counter.clone())

  RETURN counter
END FUNCTION

FUNCTION counter_vec.collect() -> MetricFamily
  counters <- self.counters.read()

  metrics <- Vec::new()
  FOR EACH (_, counter) IN counters DO
    metrics.push(Metric {
      labels: counter.labels.clone(),
      value: MetricValue::Counter(counter.get())
    })
  END FOR

  RETURN MetricFamily {
    name: self.name.clone(),
    help: self.help.clone(),
    metric_type: MetricType::Counter,
    metrics: metrics
  }
END FUNCTION
```

### 3.3 Gauge Implementation

```
STRUCT GaugeImpl {
  name: String,
  help: String,
  value: AtomicF64,
  labels: HashMap<String, String>
}

FUNCTION gauge.set(v: f64)
  self.value.store(v, Ordering::Release)
END FUNCTION

FUNCTION gauge.inc()
  self.add(1.0)
END FUNCTION

FUNCTION gauge.dec()
  self.sub(1.0)
END FUNCTION

FUNCTION gauge.add(v: f64)
  loop {
    current <- self.value.load(Ordering::Relaxed)
    new_value <- current + v
    IF self.value.compare_exchange_weak(
      current, new_value, Ordering::Release, Ordering::Relaxed
    ).is_ok() THEN
      BREAK
    END IF
  }
END FUNCTION

FUNCTION gauge.sub(v: f64)
  self.add(-v)
END FUNCTION

FUNCTION gauge.get() -> f64
  RETURN self.value.load(Ordering::Relaxed)
END FUNCTION

FUNCTION gauge.set_to_current_time()
  self.set(now().as_secs_f64())
END FUNCTION
```

### 3.4 Histogram Implementation

```
STRUCT HistogramImpl {
  name: String,
  help: String,
  buckets: Vec<f64>,
  bucket_counts: Vec<AtomicU64>,
  sum: AtomicF64,
  count: AtomicU64,
  labels: HashMap<String, String>
}

FUNCTION create_histogram(opts: HistogramOpts) -> Histogram
  // Default buckets for latency (in seconds)
  buckets <- opts.buckets.unwrap_or(DEFAULT_LATENCY_BUCKETS)

  // Validate buckets are sorted
  FOR i IN 1..buckets.len() DO
    IF buckets[i] <= buckets[i-1] THEN
      PANIC("Histogram buckets must be sorted in ascending order")
    END IF
  END FOR

  // Ensure +Inf bucket exists
  IF buckets.last() != Some(&f64::INFINITY) THEN
    buckets.push(f64::INFINITY)
  END IF

  bucket_counts <- buckets.iter()
    .map(|_| AtomicU64::new(0))
    .collect()

  RETURN HistogramImpl {
    name: opts.name,
    help: opts.help,
    buckets: buckets,
    bucket_counts: bucket_counts,
    sum: AtomicF64::new(0.0),
    count: AtomicU64::new(0),
    labels: HashMap::new()
  }
END FUNCTION

CONST DEFAULT_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0
]

FUNCTION histogram.observe(v: f64)
  // Increment bucket counts
  FOR i IN 0..self.buckets.len() DO
    IF v <= self.buckets[i] THEN
      self.bucket_counts[i].fetch_add(1, Ordering::Relaxed)
    END IF
  END FOR

  // Update sum (atomic)
  loop {
    current <- self.sum.load(Ordering::Relaxed)
    new_value <- current + v
    IF self.sum.compare_exchange_weak(
      current, new_value, Ordering::Release, Ordering::Relaxed
    ).is_ok() THEN
      BREAK
    END IF
  }

  // Increment count
  self.count.fetch_add(1, Ordering::Relaxed)
END FUNCTION

FUNCTION histogram.start_timer() -> HistogramTimer
  RETURN HistogramTimer {
    histogram: self.clone(),
    start: Instant::now()
  }
END FUNCTION

STRUCT HistogramTimer {
  histogram: Histogram,
  start: Instant
}

FUNCTION timer.observe_duration()
  // Called when timer is dropped or explicitly
  duration <- self.start.elapsed()
  self.histogram.observe(duration.as_secs_f64())
END FUNCTION

// Implement Drop for automatic observation
IMPL Drop FOR HistogramTimer {
  FUNCTION drop(self)
    self.observe_duration()
  END FUNCTION
}

FUNCTION histogram.collect() -> MetricFamily
  metrics <- Vec::new()

  // Collect bucket values
  cumulative <- 0u64
  FOR i IN 0..self.buckets.len() DO
    cumulative <- cumulative + self.bucket_counts[i].load(Ordering::Relaxed)

    bucket_labels <- self.labels.clone()
    bucket_labels.insert("le", format_float(self.buckets[i]))

    metrics.push(Metric {
      labels: bucket_labels,
      value: MetricValue::Bucket(cumulative)
    })
  END FOR

  // Add sum
  sum_labels <- self.labels.clone()
  metrics.push(Metric {
    labels: sum_labels.clone(),
    value: MetricValue::Sum(self.sum.load(Ordering::Relaxed))
  })

  // Add count
  metrics.push(Metric {
    labels: sum_labels,
    value: MetricValue::Count(self.count.load(Ordering::Relaxed))
  })

  RETURN MetricFamily {
    name: self.name.clone(),
    help: self.help.clone(),
    metric_type: MetricType::Histogram,
    metrics: metrics
  }
END FUNCTION
```

---

## 4. Label Management

### 4.1 Label Validation

```
FUNCTION is_valid_label_name(name: String) -> bool
  // Label names must match [a-zA-Z_][a-zA-Z0-9_]*
  // Labels starting with __ are reserved
  IF name.is_empty() THEN
    RETURN false
  END IF

  IF name.starts_with("__") THEN
    RETURN false
  END IF

  first_char <- name.chars().next()
  IF NOT (first_char.is_ascii_alphabetic() OR first_char == '_') THEN
    RETURN false
  END IF

  FOR char IN name.chars().skip(1) DO
    IF NOT (char.is_ascii_alphanumeric() OR char == '_') THEN
      RETURN false
    END IF
  END FOR

  RETURN true
END FUNCTION

FUNCTION is_valid_label_value(value: String) -> bool
  // Label values can be any UTF-8 string
  // But we should warn about high-cardinality values
  RETURN true
END FUNCTION
```

### 4.2 Cardinality Enforcement

```
STRUCT CardinalityTracker {
  limits: HashMap<String, usize>,
  counts: RwLock<HashMap<String, HashSet<Vec<String>>>>,
  logger: Logger
}

FUNCTION cardinality_tracker.check(
  metric_name: String,
  label_values: Vec<String>
) -> Result<(), MetricsError>
  limit <- self.limits.get(&metric_name)
    .or_else(|| self.limits.get("default"))
    .unwrap_or(&1000)

  counts <- self.counts.write()

  IF NOT counts.contains_key(&metric_name) THEN
    counts.insert(metric_name.clone(), HashSet::new())
  END IF

  metric_labels <- counts.get_mut(&metric_name).unwrap()

  // Check if already tracked
  IF metric_labels.contains(&label_values) THEN
    RETURN Ok(())
  END IF

  // Check limit
  IF metric_labels.len() >= *limit THEN
    self.logger.warn("Cardinality limit exceeded", {
      metric: metric_name,
      limit: limit,
      current: metric_labels.len()
    })

    RETURN Error(MetricsError::CardinalityExceeded {
      metric: metric_name,
      limit: *limit
    })
  END IF

  // Track new label combination
  metric_labels.insert(label_values)

  RETURN Ok(())
END FUNCTION

FUNCTION cardinality_tracker.reset(metric_name: String)
  counts <- self.counts.write()
  counts.remove(&metric_name)
END FUNCTION

FUNCTION cardinality_tracker.get_stats() -> HashMap<String, CardinalityStats>
  counts <- self.counts.read()
  stats <- HashMap::new()

  FOR EACH (metric, labels) IN counts DO
    limit <- self.limits.get(metric).unwrap_or(&1000)
    stats.insert(metric.clone(), CardinalityStats {
      current: labels.len(),
      limit: *limit,
      utilization: labels.len() as f64 / *limit as f64
    })
  END FOR

  RETURN stats
END FUNCTION
```

### 4.3 Label Sanitization

```
FUNCTION sanitize_label_value(value: String) -> String
  // Replace problematic characters
  result <- value
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")

  // Truncate if too long
  IF result.len() > MAX_LABEL_VALUE_LENGTH THEN
    result <- result[0..MAX_LABEL_VALUE_LENGTH].to_string()
  END IF

  RETURN result
END FUNCTION

CONST MAX_LABEL_VALUE_LENGTH = 128

FUNCTION validate_label_set(labels: HashMap<String, String>) -> Result<(), MetricsError>
  errors <- Vec::new()

  FOR EACH (key, value) IN labels DO
    IF NOT is_valid_label_name(key) THEN
      errors.push(format("Invalid label name: {}", key))
    END IF

    IF is_high_cardinality_value(value) THEN
      errors.push(format("High cardinality label value detected: {}={}", key, value))
    END IF
  END FOR

  IF NOT errors.is_empty() THEN
    RETURN Error(MetricsError::InvalidLabel {
      messages: errors
    })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION is_high_cardinality_value(value: String) -> bool
  // Detect potential high-cardinality values
  // UUID pattern
  IF matches_uuid_pattern(value) THEN
    RETURN true
  END IF

  // Timestamp pattern
  IF matches_timestamp_pattern(value) THEN
    RETURN true
  END IF

  // Very long values
  IF value.len() > 64 THEN
    RETURN true
  END IF

  RETURN false
END FUNCTION
```

---

## 5. Prometheus Serialization

### 5.1 Text Format Serialization

```
FUNCTION serialize_to_prometheus_text(families: Vec<MetricFamily>) -> String
  output <- StringBuilder::new()

  FOR EACH family IN families DO
    // Write HELP line
    output.append(format("# HELP {} {}\n",
      family.name,
      escape_help_text(family.help)
    ))

    // Write TYPE line
    type_str <- MATCH family.metric_type
      MetricType::Counter => "counter"
      MetricType::Gauge => "gauge"
      MetricType::Histogram => "histogram"
      MetricType::Summary => "summary"
      MetricType::Untyped => "untyped"
    END MATCH

    output.append(format("# TYPE {} {}\n", family.name, type_str))

    // Write metric lines
    FOR EACH metric IN family.metrics DO
      line <- serialize_metric_line(family.name, family.metric_type, metric)
      output.append(line)
      output.append("\n")
    END FOR

    // Blank line between families
    output.append("\n")
  END FOR

  RETURN output.to_string()
END FUNCTION

FUNCTION serialize_metric_line(
  name: String,
  metric_type: MetricType,
  metric: Metric
) -> String
  // Format metric name with labels
  labels_str <- format_labels(metric.labels)

  MATCH metric.value
    MetricValue::Counter(v) =>
      RETURN format("{}{} {}", name, labels_str, format_value(v))

    MetricValue::Gauge(v) =>
      RETURN format("{}{} {}", name, labels_str, format_value(v))

    MetricValue::Bucket(v) =>
      RETURN format("{}_bucket{} {}", name, labels_str, v)

    MetricValue::Sum(v) =>
      RETURN format("{}_sum{} {}", name, labels_str, format_value(v))

    MetricValue::Count(v) =>
      RETURN format("{}_count{} {}", name, labels_str, v)

    MetricValue::Quantile(q, v) =>
      quantile_labels <- metric.labels.clone()
      quantile_labels.insert("quantile", format_value(q))
      RETURN format("{}{} {}", name, format_labels(quantile_labels), format_value(v))
  END MATCH
END FUNCTION

FUNCTION format_labels(labels: HashMap<String, String>) -> String
  IF labels.is_empty() THEN
    RETURN ""
  END IF

  // Sort labels for consistent output
  sorted_labels <- labels.iter()
    .sorted_by(|a, b| a.0.cmp(b.0))
    .collect::<Vec<_>>()

  label_pairs <- sorted_labels.iter()
    .map(|(k, v)| format("{}=\"{}\"", k, escape_label_value(v)))
    .collect::<Vec<_>>()
    .join(",")

  RETURN format("{{{}}}", label_pairs)
END FUNCTION

FUNCTION format_value(v: f64) -> String
  IF v.is_nan() THEN
    RETURN "NaN"
  ELSE IF v.is_infinite() THEN
    IF v > 0.0 THEN
      RETURN "+Inf"
    ELSE
      RETURN "-Inf"
    END IF
  ELSE IF v == v.floor() AND v.abs() < 1e15 THEN
    // Integer value
    RETURN format("{}", v as i64)
  ELSE
    RETURN format("{}", v)
  END IF
END FUNCTION

FUNCTION escape_help_text(text: String) -> String
  RETURN text
    .replace("\\", "\\\\")
    .replace("\n", "\\n")
END FUNCTION

FUNCTION escape_label_value(value: String) -> String
  RETURN value
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\n", "\\n")
END FUNCTION
```

### 5.2 OpenMetrics Format Serialization

```
FUNCTION serialize_to_openmetrics(families: Vec<MetricFamily>) -> String
  output <- StringBuilder::new()

  FOR EACH family IN families DO
    // Write HELP line
    output.append(format("# HELP {} {}\n",
      family.name,
      escape_help_text(family.help)
    ))

    // Write TYPE line (OpenMetrics uses different type names)
    type_str <- MATCH family.metric_type
      MetricType::Counter => "counter"
      MetricType::Gauge => "gauge"
      MetricType::Histogram => "histogram"
      MetricType::Summary => "summary"
      MetricType::Untyped => "unknown"
    END MATCH

    output.append(format("# TYPE {} {}\n", family.name, type_str))

    // Write UNIT line if applicable
    IF family.unit IS Some THEN
      output.append(format("# UNIT {} {}\n", family.name, family.unit))
    END IF

    // Write metric lines with timestamp support
    FOR EACH metric IN family.metrics DO
      line <- serialize_openmetrics_line(family.name, family.metric_type, metric)
      output.append(line)
      output.append("\n")
    END FOR
  END FOR

  // OpenMetrics requires EOF marker
  output.append("# EOF\n")

  RETURN output.to_string()
END FUNCTION

FUNCTION serialize_openmetrics_line(
  name: String,
  metric_type: MetricType,
  metric: Metric
) -> String
  labels_str <- format_labels(metric.labels)

  // OpenMetrics counters need _total suffix
  metric_name <- IF metric_type == MetricType::Counter THEN
    format("{}_total", name)
  ELSE
    name
  END IF

  value_str <- format_openmetrics_value(metric.value)

  // Add timestamp if present
  IF metric.timestamp IS Some THEN
    timestamp_str <- format_timestamp(metric.timestamp)
    RETURN format("{}{} {} {}", metric_name, labels_str, value_str, timestamp_str)
  ELSE
    RETURN format("{}{} {}", metric_name, labels_str, value_str)
  END IF
END FUNCTION

FUNCTION format_openmetrics_value(value: MetricValue) -> String
  // OpenMetrics uses different representation
  MATCH value
    MetricValue::Counter(v) =>
      RETURN format_value(v)
    MetricValue::Gauge(v) =>
      RETURN format_value(v)
    _ =>
      // Same as Prometheus format
      RETURN format_value(value.as_f64())
  END MATCH
END FUNCTION
```

---

## 6. HTTP Endpoint Handler

### 6.1 Metrics Handler

```
STRUCT MetricsHandler {
  registry: Arc<MetricsRegistry>,
  config: EndpointConfig,
  cache: Option<RwLock<CachedResponse>>,
  logger: Logger
}

STRUCT EndpointConfig {
  path: String,
  enable_compression: bool,
  compression_threshold: usize,
  cache_ttl: Option<Duration>,
  timeout: Duration,
  auth: Option<AuthConfig>
}

STRUCT CachedResponse {
  content: Vec<u8>,
  content_type: String,
  timestamp: Instant,
  etag: String
}

FUNCTION create_metrics_handler(
  registry: Arc<MetricsRegistry>,
  config: EndpointConfig
) -> MetricsHandler
  cache <- IF config.cache_ttl IS Some THEN
    Some(RwLock::new(CachedResponse {
      content: Vec::new(),
      content_type: "".to_string(),
      timestamp: Instant::now() - Duration::from_secs(3600),
      etag: "".to_string()
    }))
  ELSE
    None
  END IF

  RETURN MetricsHandler {
    registry: registry,
    config: config,
    cache: cache,
    logger: get_logger("prometheus.handler")
  }
END FUNCTION
```

### 6.2 Request Handling

```
ASYNC FUNCTION handler.handle(request: HttpRequest) -> HttpResponse
  start_time <- Instant::now()
  request_id <- generate_request_id()

  self.logger.debug("Metrics request received", {
    request_id: request_id,
    method: request.method,
    path: request.path
  })

  // Check authentication if configured
  IF self.config.auth IS Some THEN
    auth_result <- authenticate_request(request, self.config.auth)
    IF auth_result IS Error THEN
      RETURN HttpResponse {
        status: 401,
        headers: [("WWW-Authenticate", "Bearer")],
        body: "Unauthorized"
      }
    END IF
  END IF

  // Check cache
  IF self.cache IS Some THEN
    cached <- check_cache(self.cache, request)
    IF cached IS Some THEN
      self.logger.debug("Cache hit", { request_id: request_id })
      RETURN cached
    END IF
  END IF

  // Determine response format
  accept_header <- request.headers.get("Accept").unwrap_or("text/plain")
  format <- determine_format(accept_header)

  // Gather metrics with timeout
  TRY
    metrics_result <- tokio::time::timeout(
      self.config.timeout,
      self.gather_and_serialize(format)
    ).await

    MATCH metrics_result
      Ok(Ok((content, content_type))) =>
        // Check if compression is needed
        body <- IF self.config.enable_compression AND
                   content.len() > self.config.compression_threshold AND
                   accepts_gzip(request) THEN
          compress_gzip(content)
        ELSE
          content
        END IF

        // Update cache if enabled
        IF self.cache IS Some THEN
          update_cache(self.cache, body.clone(), content_type.clone())
        END IF

        duration <- Instant::now() - start_time
        self.logger.debug("Metrics served", {
          request_id: request_id,
          size_bytes: body.len(),
          duration_ms: duration.as_millis()
        })

        RETURN HttpResponse {
          status: 200,
          headers: build_response_headers(content_type, body.len()),
          body: body
        }

      Ok(Err(e)) =>
        self.logger.error("Metrics gathering failed", {
          request_id: request_id,
          error: e.to_string()
        })
        RETURN HttpResponse {
          status: 500,
          body: format("Metrics collection error: {}", e)
        }

      Err(_) =>
        self.logger.warn("Metrics request timeout", {
          request_id: request_id,
          timeout: self.config.timeout
        })
        RETURN HttpResponse {
          status: 503,
          body: "Metrics collection timeout"
        }
    END MATCH

  CATCH error
    self.logger.error("Handler error", {
      request_id: request_id,
      error: error.to_string()
    })
    RETURN HttpResponse {
      status: 500,
      body: "Internal server error"
    }
  END TRY
END FUNCTION

ASYNC FUNCTION handler.gather_and_serialize(format: OutputFormat) -> Result<(Vec<u8>, String), MetricsError>
  // Gather all metrics
  families <- self.registry.gather()

  // Serialize based on format
  MATCH format
    OutputFormat::PrometheusText =>
      content <- serialize_to_prometheus_text(families)
      RETURN Ok((content.into_bytes(), "text/plain; version=0.0.4; charset=utf-8"))

    OutputFormat::OpenMetrics =>
      content <- serialize_to_openmetrics(families)
      RETURN Ok((content.into_bytes(), "application/openmetrics-text; version=1.0.0; charset=utf-8"))
  END MATCH
END FUNCTION

FUNCTION determine_format(accept: String) -> OutputFormat
  IF accept.contains("application/openmetrics-text") THEN
    RETURN OutputFormat::OpenMetrics
  ELSE
    RETURN OutputFormat::PrometheusText
  END IF
END FUNCTION

FUNCTION build_response_headers(content_type: String, size: usize) -> HashMap<String, String>
  headers <- HashMap::new()
  headers.insert("Content-Type", content_type)
  headers.insert("Content-Length", size.to_string())
  headers.insert("Cache-Control", "no-cache, no-store, must-revalidate")

  RETURN headers
END FUNCTION
```

### 6.3 Health Endpoints

```
ASYNC FUNCTION handler.handle_health(request: HttpRequest) -> HttpResponse
  RETURN HttpResponse {
    status: 200,
    headers: [("Content-Type", "text/plain")],
    body: "OK"
  }
END FUNCTION

ASYNC FUNCTION handler.handle_ready(request: HttpRequest) -> HttpResponse
  // Check if metrics collection is working
  TRY
    families <- tokio::time::timeout(
      Duration::from_secs(5),
      self.registry.gather()
    ).await

    MATCH families
      Ok(_) =>
        RETURN HttpResponse {
          status: 200,
          headers: [("Content-Type", "text/plain")],
          body: "Ready"
        }
      Err(_) =>
        RETURN HttpResponse {
          status: 503,
          headers: [("Content-Type", "text/plain")],
          body: "Not Ready - metrics collection timeout"
        }
    END MATCH
  CATCH error
    RETURN HttpResponse {
      status: 503,
      body: format("Not Ready - {}", error)
    }
  END TRY
END FUNCTION
```

### 6.4 Compression

```
FUNCTION compress_gzip(data: Vec<u8>) -> Vec<u8>
  encoder <- GzEncoder::new(Vec::new(), Compression::default())
  encoder.write_all(&data)?
  RETURN encoder.finish()?
END FUNCTION

FUNCTION accepts_gzip(request: HttpRequest) -> bool
  accept_encoding <- request.headers.get("Accept-Encoding")
  RETURN accept_encoding.map(|v| v.contains("gzip")).unwrap_or(false)
END FUNCTION
```

---

## 7. LLM Metrics Collector

### 7.1 LLM Metrics Definition

```
STRUCT LlmMetricsCollector {
  requests_total: CounterVec,
  request_duration: HistogramVec,
  tokens_total: CounterVec,
  streaming_chunks: CounterVec,
  errors_total: CounterVec,
  active_requests: GaugeVec,
  model_info: GaugeVec
}

FUNCTION create_llm_metrics_collector(registry: &MetricsRegistry) -> LlmMetricsCollector
  requests_total <- registry.counter_vec(
    CounterOpts {
      name: "llm_requests_total",
      help: "Total number of LLM API requests",
      subsystem: ""
    },
    vec!["model", "provider", "operation", "status"]
  )

  request_duration <- registry.histogram_vec(
    HistogramOpts {
      name: "llm_request_duration_seconds",
      help: "LLM request latency distribution",
      subsystem: "",
      buckets: Some(vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0])
    },
    vec!["model", "provider", "operation"]
  )

  tokens_total <- registry.counter_vec(
    CounterOpts {
      name: "llm_tokens_total",
      help: "Total tokens processed",
      subsystem: ""
    },
    vec!["model", "provider", "direction"]
  )

  streaming_chunks <- registry.counter_vec(
    CounterOpts {
      name: "llm_streaming_chunks_total",
      help: "Total streaming response chunks",
      subsystem: ""
    },
    vec!["model", "provider"]
  )

  errors_total <- registry.counter_vec(
    CounterOpts {
      name: "llm_errors_total",
      help: "Total LLM request errors",
      subsystem: ""
    },
    vec!["model", "provider", "error_type"]
  )

  active_requests <- registry.gauge_vec(
    GaugeOpts {
      name: "llm_active_requests",
      help: "Currently active LLM requests",
      subsystem: ""
    },
    vec!["model", "provider"]
  )

  model_info <- registry.gauge_vec(
    GaugeOpts {
      name: "llm_model_info",
      help: "LLM model information",
      subsystem: ""
    },
    vec!["model", "provider", "version"]
  )

  RETURN LlmMetricsCollector {
    requests_total,
    request_duration,
    tokens_total,
    streaming_chunks,
    errors_total,
    active_requests,
    model_info
  }
END FUNCTION
```

### 7.2 LLM Metrics Recording

```
FUNCTION llm_collector.record_request(params: LlmRequestParams)
  // Map status to label value
  status_label <- IF params.success THEN "success" ELSE "error" END IF

  // Increment request counter
  self.requests_total
    .with_label_values(&[params.model, params.provider, params.operation, status_label])
    .inc()

  // Record duration
  self.request_duration
    .with_label_values(&[params.model, params.provider, params.operation])
    .observe(params.duration.as_secs_f64())

  // Record tokens
  IF params.input_tokens > 0 THEN
    self.tokens_total
      .with_label_values(&[params.model, params.provider, "input"])
      .inc_by(params.input_tokens as f64)
  END IF

  IF params.output_tokens > 0 THEN
    self.tokens_total
      .with_label_values(&[params.model, params.provider, "output"])
      .inc_by(params.output_tokens as f64)
  END IF
END FUNCTION

STRUCT LlmRequestParams {
  model: String,
  provider: String,
  operation: String,
  duration: Duration,
  input_tokens: u64,
  output_tokens: u64,
  success: bool
}

FUNCTION llm_collector.record_streaming_chunk(model: &str, provider: &str)
  self.streaming_chunks
    .with_label_values(&[model, provider])
    .inc()
END FUNCTION

FUNCTION llm_collector.record_error(model: &str, provider: &str, error_type: &str)
  self.errors_total
    .with_label_values(&[model, provider, error_type])
    .inc()
END FUNCTION

FUNCTION llm_collector.track_active_request(model: &str, provider: &str) -> ActiveRequestGuard
  self.active_requests
    .with_label_values(&[model, provider])
    .inc()

  RETURN ActiveRequestGuard {
    gauge: self.active_requests.with_label_values(&[model, provider])
  }
END FUNCTION

STRUCT ActiveRequestGuard {
  gauge: Gauge
}

IMPL Drop FOR ActiveRequestGuard {
  FUNCTION drop(self)
    self.gauge.dec()
  END FUNCTION
}

FUNCTION llm_collector.register_model(model: &str, provider: &str, version: &str)
  self.model_info
    .with_label_values(&[model, provider, version])
    .set(1.0)
END FUNCTION
```

---

## 8. Agent Metrics Collector

### 8.1 Agent Metrics Definition

```
STRUCT AgentMetricsCollector {
  executions_total: CounterVec,
  execution_duration: HistogramVec,
  steps_total: CounterVec,
  step_duration: HistogramVec,
  tool_calls_total: CounterVec,
  tool_call_duration: HistogramVec,
  memory_operations: CounterVec,
  active_agents: GaugeVec,
  agent_errors: CounterVec
}

FUNCTION create_agent_metrics_collector(registry: &MetricsRegistry) -> AgentMetricsCollector
  executions_total <- registry.counter_vec(
    CounterOpts {
      name: "agent_executions_total",
      help: "Total agent executions",
      subsystem: ""
    },
    vec!["agent_type", "status"]
  )

  execution_duration <- registry.histogram_vec(
    HistogramOpts {
      name: "agent_execution_duration_seconds",
      help: "Agent execution duration",
      subsystem: "",
      buckets: Some(vec![0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0])
    },
    vec!["agent_type"]
  )

  steps_total <- registry.counter_vec(
    CounterOpts {
      name: "agent_steps_total",
      help: "Total agent steps completed",
      subsystem: ""
    },
    vec!["agent_type", "step_type"]
  )

  step_duration <- registry.histogram_vec(
    HistogramOpts {
      name: "agent_step_duration_seconds",
      help: "Agent step duration",
      subsystem: "",
      buckets: Some(vec![0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0])
    },
    vec!["agent_type", "step_type"]
  )

  tool_calls_total <- registry.counter_vec(
    CounterOpts {
      name: "agent_tool_calls_total",
      help: "Total agent tool invocations",
      subsystem: ""
    },
    vec!["agent_type", "tool_name", "status"]
  )

  tool_call_duration <- registry.histogram_vec(
    HistogramOpts {
      name: "agent_tool_call_duration_seconds",
      help: "Agent tool call duration",
      subsystem: "",
      buckets: Some(vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0])
    },
    vec!["agent_type", "tool_name"]
  )

  memory_operations <- registry.counter_vec(
    CounterOpts {
      name: "agent_memory_operations_total",
      help: "Total agent memory operations",
      subsystem: ""
    },
    vec!["agent_type", "operation_type"]
  )

  active_agents <- registry.gauge_vec(
    GaugeOpts {
      name: "agent_active",
      help: "Currently active agents",
      subsystem: ""
    },
    vec!["agent_type"]
  )

  agent_errors <- registry.counter_vec(
    CounterOpts {
      name: "agent_errors_total",
      help: "Total agent errors",
      subsystem: ""
    },
    vec!["agent_type", "error_type"]
  )

  RETURN AgentMetricsCollector {
    executions_total,
    execution_duration,
    steps_total,
    step_duration,
    tool_calls_total,
    tool_call_duration,
    memory_operations,
    active_agents,
    agent_errors
  }
END FUNCTION
```

### 8.2 Agent Metrics Recording

```
FUNCTION agent_collector.record_execution(
  agent_type: &str,
  duration: Duration,
  status: ExecutionStatus
)
  status_label <- MATCH status
    ExecutionStatus::Success => "success"
    ExecutionStatus::Failed => "failed"
    ExecutionStatus::Timeout => "timeout"
    ExecutionStatus::Cancelled => "cancelled"
  END MATCH

  self.executions_total
    .with_label_values(&[agent_type, status_label])
    .inc()

  self.execution_duration
    .with_label_values(&[agent_type])
    .observe(duration.as_secs_f64())
END FUNCTION

FUNCTION agent_collector.record_step(
  agent_type: &str,
  step_type: &str,
  duration: Duration
)
  self.steps_total
    .with_label_values(&[agent_type, step_type])
    .inc()

  self.step_duration
    .with_label_values(&[agent_type, step_type])
    .observe(duration.as_secs_f64())
END FUNCTION

FUNCTION agent_collector.record_tool_call(
  agent_type: &str,
  tool_name: &str,
  duration: Duration,
  success: bool
)
  status_label <- IF success THEN "success" ELSE "error" END IF

  self.tool_calls_total
    .with_label_values(&[agent_type, tool_name, status_label])
    .inc()

  self.tool_call_duration
    .with_label_values(&[agent_type, tool_name])
    .observe(duration.as_secs_f64())
END FUNCTION

FUNCTION agent_collector.record_memory_operation(
  agent_type: &str,
  operation_type: &str
)
  self.memory_operations
    .with_label_values(&[agent_type, operation_type])
    .inc()
END FUNCTION

FUNCTION agent_collector.set_active_agents(agent_type: &str, count: i64)
  self.active_agents
    .with_label_values(&[agent_type])
    .set(count as f64)
END FUNCTION

FUNCTION agent_collector.record_error(agent_type: &str, error_type: &str)
  self.agent_errors
    .with_label_values(&[agent_type, error_type])
    .inc()
END FUNCTION
```

---

## 9. Default Collectors

### 9.1 Process Collector

```
STRUCT ProcessCollector {
  cpu_seconds: Counter,
  open_fds: Gauge,
  max_fds: Gauge,
  virtual_memory_bytes: Gauge,
  resident_memory_bytes: Gauge,
  start_time_seconds: Gauge,
  threads: Gauge
}

FUNCTION ProcessCollector::new() -> ProcessCollector
  RETURN ProcessCollector {
    cpu_seconds: Counter::new("process_cpu_seconds_total", "Total user and system CPU time"),
    open_fds: Gauge::new("process_open_fds", "Number of open file descriptors"),
    max_fds: Gauge::new("process_max_fds", "Maximum number of open file descriptors"),
    virtual_memory_bytes: Gauge::new("process_virtual_memory_bytes", "Virtual memory size"),
    resident_memory_bytes: Gauge::new("process_resident_memory_bytes", "Resident memory size"),
    start_time_seconds: Gauge::new("process_start_time_seconds", "Start time since unix epoch"),
    threads: Gauge::new("process_threads", "Number of OS threads")
  }
END FUNCTION

FUNCTION process_collector.collect() -> Vec<MetricFamily>
  families <- Vec::new()

  // Get process stats from /proc/self on Linux
  TRY
    stat <- read_proc_stat()

    // CPU time
    cpu_time <- (stat.utime + stat.stime) as f64 / sysconf(SC_CLK_TCK)
    self.cpu_seconds.set(cpu_time)
    families.push(self.cpu_seconds.collect())

    // Memory
    self.virtual_memory_bytes.set(stat.vsize as f64)
    families.push(self.virtual_memory_bytes.collect())

    self.resident_memory_bytes.set(stat.rss * page_size() as f64)
    families.push(self.resident_memory_bytes.collect())

    // Threads
    self.threads.set(stat.num_threads as f64)
    families.push(self.threads.collect())

    // Start time
    boot_time <- get_boot_time()
    start_time <- boot_time + stat.starttime / sysconf(SC_CLK_TCK)
    self.start_time_seconds.set(start_time as f64)
    families.push(self.start_time_seconds.collect())

    // File descriptors
    fd_count <- count_open_fds()
    self.open_fds.set(fd_count as f64)
    families.push(self.open_fds.collect())

    max_fd <- get_max_fds()
    self.max_fds.set(max_fd as f64)
    families.push(self.max_fds.collect())

  CATCH error
    log_warn("Failed to collect process metrics", { error: error.to_string() })
  END TRY

  RETURN families
END FUNCTION
```

### 9.2 Runtime Collector (Rust)

```
STRUCT RustRuntimeCollector {
  allocations_total: Counter,
  deallocations_total: Counter,
  allocated_bytes: Gauge,
  gc_collections: Counter,  // For GC languages
  gc_duration_seconds: Histogram
}

FUNCTION RustRuntimeCollector::new() -> RustRuntimeCollector
  // Note: Rust doesn't have GC, but we track allocator stats if available
  RETURN RustRuntimeCollector {
    allocations_total: Counter::new("rust_allocations_total", "Total memory allocations"),
    deallocations_total: Counter::new("rust_deallocations_total", "Total memory deallocations"),
    allocated_bytes: Gauge::new("rust_allocated_bytes", "Currently allocated bytes")
  }
END FUNCTION

FUNCTION rust_runtime_collector.collect() -> Vec<MetricFamily>
  families <- Vec::new()

  // If using jemalloc or similar with stats
  IF allocator_stats_available() THEN
    stats <- get_allocator_stats()

    self.allocations_total.set(stats.allocations as f64)
    families.push(self.allocations_total.collect())

    self.deallocations_total.set(stats.deallocations as f64)
    families.push(self.deallocations_total.collect())

    self.allocated_bytes.set(stats.allocated as f64)
    families.push(self.allocated_bytes.collect())
  END IF

  RETURN families
END FUNCTION
```

### 9.3 Runtime Collector (TypeScript/Node.js)

```
STRUCT NodeRuntimeCollector {
  heap_size_bytes: Gauge,
  heap_used_bytes: Gauge,
  external_bytes: Gauge,
  gc_duration_seconds: Histogram,
  gc_collections_total: CounterVec,
  event_loop_lag_seconds: Histogram,
  active_handles: Gauge,
  active_requests: Gauge
}

FUNCTION NodeRuntimeCollector::new() -> NodeRuntimeCollector
  RETURN NodeRuntimeCollector {
    heap_size_bytes: Gauge::new("nodejs_heap_size_bytes", "V8 heap size"),
    heap_used_bytes: Gauge::new("nodejs_heap_used_bytes", "V8 heap used"),
    external_bytes: Gauge::new("nodejs_external_bytes", "V8 external memory"),
    gc_duration_seconds: Histogram::new(
      "nodejs_gc_duration_seconds",
      "Garbage collection duration",
      vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5]
    ),
    gc_collections_total: CounterVec::new(
      "nodejs_gc_collections_total",
      "Total GC collections",
      vec!["type"]
    ),
    event_loop_lag_seconds: Histogram::new(
      "nodejs_event_loop_lag_seconds",
      "Event loop lag",
      vec![0.001, 0.01, 0.1, 1.0]
    ),
    active_handles: Gauge::new("nodejs_active_handles", "Active handles"),
    active_requests: Gauge::new("nodejs_active_requests", "Active requests")
  }
END FUNCTION

FUNCTION node_runtime_collector.collect() -> Vec<MetricFamily>
  families <- Vec::new()

  // Memory usage
  mem <- process.memoryUsage()
  self.heap_size_bytes.set(mem.heapTotal)
  self.heap_used_bytes.set(mem.heapUsed)
  self.external_bytes.set(mem.external)

  families.push(self.heap_size_bytes.collect())
  families.push(self.heap_used_bytes.collect())
  families.push(self.external_bytes.collect())

  // Active handles/requests
  self.active_handles.set(process._getActiveHandles().length)
  self.active_requests.set(process._getActiveRequests().length)

  families.push(self.active_handles.collect())
  families.push(self.active_requests.collect())

  RETURN families
END FUNCTION
```

---

## 10. Testing Support

### 10.1 Mock Registry

```
STRUCT MockRegistry {
  recorded_metrics: RwLock<HashMap<String, Vec<RecordedMetric>>>,
  counters: RwLock<HashMap<String, f64>>,
  gauges: RwLock<HashMap<String, f64>>,
  histograms: RwLock<HashMap<String, Vec<f64>>>
}

STRUCT RecordedMetric {
  name: String,
  labels: HashMap<String, String>,
  value: f64,
  timestamp: Instant
}

FUNCTION MockRegistry::new() -> MockRegistry
  RETURN MockRegistry {
    recorded_metrics: RwLock::new(HashMap::new()),
    counters: RwLock::new(HashMap::new()),
    gauges: RwLock::new(HashMap::new()),
    histograms: RwLock::new(HashMap::new())
  }
END FUNCTION

FUNCTION mock_registry.counter(opts: CounterOpts) -> MockCounter
  RETURN MockCounter {
    name: opts.name,
    registry: self.clone()
  }
END FUNCTION

STRUCT MockCounter {
  name: String,
  registry: Arc<MockRegistry>
}

FUNCTION mock_counter.inc()
  self.inc_by(1.0)
END FUNCTION

FUNCTION mock_counter.inc_by(v: f64)
  counters <- self.registry.counters.write()
  current <- counters.get(&self.name).unwrap_or(&0.0)
  counters.insert(self.name.clone(), current + v)

  // Record for assertions
  recorded <- self.registry.recorded_metrics.write()
  IF NOT recorded.contains_key(&self.name) THEN
    recorded.insert(self.name.clone(), Vec::new())
  END IF
  recorded.get_mut(&self.name).unwrap().push(RecordedMetric {
    name: self.name.clone(),
    labels: HashMap::new(),
    value: v,
    timestamp: Instant::now()
  })
END FUNCTION
```

### 10.2 Test Assertions

```
FUNCTION mock_registry.assert_counter_value(name: &str, expected: f64)
  counters <- self.counters.read()
  actual <- counters.get(name).unwrap_or(&0.0)

  IF (actual - expected).abs() > 0.0001 THEN
    PANIC("Counter {} expected {} but was {}", name, expected, actual)
  END IF
END FUNCTION

FUNCTION mock_registry.assert_counter_value_with_labels(
  name: &str,
  labels: HashMap<String, String>,
  expected: f64
)
  key <- format_metric_key(name, labels)
  counters <- self.counters.read()
  actual <- counters.get(&key).unwrap_or(&0.0)

  IF (actual - expected).abs() > 0.0001 THEN
    PANIC("Counter {} with labels {:?} expected {} but was {}",
      name, labels, expected, actual)
  END IF
END FUNCTION

FUNCTION mock_registry.assert_gauge_value(name: &str, expected: f64)
  gauges <- self.gauges.read()
  actual <- gauges.get(name).unwrap_or(&0.0)

  IF (actual - expected).abs() > 0.0001 THEN
    PANIC("Gauge {} expected {} but was {}", name, expected, actual)
  END IF
END FUNCTION

FUNCTION mock_registry.assert_histogram_observations(name: &str, expected_count: usize)
  histograms <- self.histograms.read()
  observations <- histograms.get(name).unwrap_or(&Vec::new())

  IF observations.len() != expected_count THEN
    PANIC("Histogram {} expected {} observations but had {}",
      name, expected_count, observations.len())
  END IF
END FUNCTION

FUNCTION mock_registry.get_recorded_metrics(name: &str) -> Vec<RecordedMetric>
  recorded <- self.recorded_metrics.read()
  RETURN recorded.get(name).cloned().unwrap_or(Vec::new())
END FUNCTION

FUNCTION mock_registry.reset()
  self.recorded_metrics.write().clear()
  self.counters.write().clear()
  self.gauges.write().clear()
  self.histograms.write().clear()
END FUNCTION
```

### 10.3 Test Helpers

```
FUNCTION create_test_registry() -> MockRegistry
  RETURN MockRegistry::new()
END FUNCTION

FUNCTION create_test_llm_collector(registry: &MockRegistry) -> LlmMetricsCollector
  RETURN create_llm_metrics_collector(registry)
END FUNCTION

// Example test
FUNCTION test_llm_request_recording()
  registry <- create_test_registry()
  collector <- create_test_llm_collector(&registry)

  // Record a request
  collector.record_request(LlmRequestParams {
    model: "claude-3-opus",
    provider: "anthropic",
    operation: "chat",
    duration: Duration::from_millis(1500),
    input_tokens: 100,
    output_tokens: 500,
    success: true
  })

  // Assert metrics
  registry.assert_counter_value_with_labels(
    "llmdevops_llm_requests_total",
    HashMap::from([
      ("model", "claude-3-opus"),
      ("provider", "anthropic"),
      ("operation", "chat"),
      ("status", "success")
    ]),
    1.0
  )

  registry.assert_counter_value_with_labels(
    "llmdevops_llm_tokens_total",
    HashMap::from([
      ("model", "claude-3-opus"),
      ("provider", "anthropic"),
      ("direction", "input")
    ]),
    100.0
  )

  registry.assert_counter_value_with_labels(
    "llmdevops_llm_tokens_total",
    HashMap::from([
      ("model", "claude-3-opus"),
      ("provider", "anthropic"),
      ("direction", "output")
    ]),
    500.0
  )
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, module structure, data flow, and integration patterns.
