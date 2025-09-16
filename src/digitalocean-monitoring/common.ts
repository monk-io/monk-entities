/**
 * Common types and utilities for DigitalOcean Monitoring entities.
 */

/**
 * Supported metric types for DigitalOcean monitoring
 */
export type MetricType = 
    // === DROPLET METRICS ===
    // CPU and Load
    | "v1/insights/droplet/cpu"
    | "v1/insights/droplet/load_1"
    | "v1/insights/droplet/load_5"
    | "v1/insights/droplet/load_15"
    // Memory
    | "v1/insights/droplet/memory_utilization_percent"
    | "v1/insights/droplet/memory_available"
    | "v1/insights/droplet/memory_cached"
    | "v1/insights/droplet/memory_free"
    | "v1/insights/droplet/memory_total"
    // Disk
    | "v1/insights/droplet/disk_utilization_percent"
    | "v1/insights/droplet/disk_read"
    | "v1/insights/droplet/disk_write"
    // Filesystem
    | "v1/insights/droplet/filesystem_free"
    | "v1/insights/droplet/filesystem_size"
    // Network Bandwidth
    | "v1/insights/droplet/public_outbound_bandwidth"
    | "v1/insights/droplet/public_inbound_bandwidth"
    | "v1/insights/droplet/private_outbound_bandwidth"
    | "v1/insights/droplet/private_inbound_bandwidth"
    // Network Packets
    | "v1/insights/droplet/network_outbound_packets"
    | "v1/insights/droplet/network_inbound_packets"
    | "v1/insights/droplet/network_outbound_errors"
    | "v1/insights/droplet/network_inbound_errors"
    
    // === LOAD BALANCER METRICS ===
    | "v1/insights/lbaas/avg_cpu_utilization_percent"
    | "v1/insights/lbaas/connection_utilization_percent"
    | "v1/insights/lbaas/droplet_health"
    | "v1/insights/lbaas/tls_connections_per_second_utilization_percent"
    | "v1/insights/lbaas/increase_in_http_error_rate_percentage_5xx"
    | "v1/insights/lbaas/increase_in_http_error_rate_percentage_4xx"
    | "v1/insights/lbaas/increase_in_http_error_rate_count_5xx"
    | "v1/insights/lbaas/increase_in_http_error_rate_count_4xx"
    | "v1/insights/lbaas/high_http_request_response_time"
    | "v1/insights/lbaas/high_http_request_response_time_50p"
    | "v1/insights/lbaas/high_http_request_response_time_95p"
    | "v1/insights/lbaas/high_http_request_response_time_99p"
    
    // === DATABASE METRICS ===
    | "v1/dbaas/alerts/load_15_alerts"
    | "v1/dbaas/alerts/cpu_alerts"
    | "v1/dbaas/alerts/memory_utilization_alerts"
    | "v1/dbaas/alerts/disk_utilization_alerts"
    
    // === VOLUME METRICS ===
    | "v1/insights/volumes/filesystem_free"
    | "v1/insights/volumes/filesystem_size"
    | "v1/insights/volumes/read_bytes"
    | "v1/insights/volumes/write_bytes"
    
    // === APP METRICS ===
    | "v1/insights/apps/cpu_percentage"
    | "v1/insights/apps/memory_percentage";

/**
 * Alert comparison operators
 */
export type AlertComparisonOperator = "GreaterThan" | "LessThan";

/**
 * Alert time windows
 */
export type AlertWindow = "5m" | "10m" | "30m" | "1h";

// Type aliases for MonkEC compatibility
export type AlertPolicyType = MetricType;
export type AlertPolicyComparator = AlertComparisonOperator;
export type AlertPolicyWindow = AlertWindow;

/**
 * Slack channel configuration for notifications
 */
export interface SlackChannel {
    channel: string;
    url: string;
}

/**
 * Droplet information from DigitalOcean API
 */
export interface Droplet {
    id: number;
    name: string;
    status: string;
    region: {
        slug: string;
        name: string;
    };
    tags?: string[];
}

/**
 * Alert Policy from DigitalOcean API
 */
export interface AlertPolicy {
    uuid: string;
    type: MetricType;
    description: string;
    compare: AlertComparisonOperator;
    value: number;
    window: AlertWindow;
    entities?: string[];
    tags?: string[];
    alerts?: {
        email?: string[];
        slack?: Array<{
            type: string;
            channel: string;
            url: string;
        }>;
    };
    enabled: boolean;
    created_at?: string;
}

/**
 * Validate metric type
 */
export function validateMetricType(type: string): MetricType {
    const validTypes: MetricType[] = [
        // === DROPLET METRICS ===
        // CPU and Load
        "v1/insights/droplet/cpu",
        "v1/insights/droplet/load_1",
        "v1/insights/droplet/load_5", 
        "v1/insights/droplet/load_15",
        // Memory
        "v1/insights/droplet/memory_utilization_percent",
        "v1/insights/droplet/memory_available",
        "v1/insights/droplet/memory_cached",
        "v1/insights/droplet/memory_free",
        "v1/insights/droplet/memory_total",
        // Disk
        "v1/insights/droplet/disk_utilization_percent",
        "v1/insights/droplet/disk_read",
        "v1/insights/droplet/disk_write",
        // Filesystem
        "v1/insights/droplet/filesystem_free",
        "v1/insights/droplet/filesystem_size",
        // Network Bandwidth
        "v1/insights/droplet/public_outbound_bandwidth",
        "v1/insights/droplet/public_inbound_bandwidth",
        "v1/insights/droplet/private_outbound_bandwidth",
        "v1/insights/droplet/private_inbound_bandwidth",
        // Network Packets
        "v1/insights/droplet/network_outbound_packets",
        "v1/insights/droplet/network_inbound_packets",
        "v1/insights/droplet/network_outbound_errors",
        "v1/insights/droplet/network_inbound_errors",
        
        // === LOAD BALANCER METRICS ===
        "v1/insights/lbaas/avg_cpu_utilization_percent",
        "v1/insights/lbaas/connection_utilization_percent",
        "v1/insights/lbaas/droplet_health",
        "v1/insights/lbaas/tls_connections_per_second_utilization_percent",
        "v1/insights/lbaas/increase_in_http_error_rate_percentage_5xx",
        "v1/insights/lbaas/increase_in_http_error_rate_percentage_4xx",
        "v1/insights/lbaas/increase_in_http_error_rate_count_5xx",
        "v1/insights/lbaas/increase_in_http_error_rate_count_4xx",
        "v1/insights/lbaas/high_http_request_response_time",
        "v1/insights/lbaas/high_http_request_response_time_50p",
        "v1/insights/lbaas/high_http_request_response_time_95p",
        "v1/insights/lbaas/high_http_request_response_time_99p",
        
        // === DATABASE METRICS ===
        "v1/dbaas/alerts/load_15_alerts",
        "v1/dbaas/alerts/cpu_alerts",
        "v1/dbaas/alerts/memory_utilization_alerts",
        "v1/dbaas/alerts/disk_utilization_alerts",
        
        // === VOLUME METRICS ===
        "v1/insights/volumes/filesystem_free",
        "v1/insights/volumes/filesystem_size",
        "v1/insights/volumes/read_bytes",
        "v1/insights/volumes/write_bytes",
        
        // === APP METRICS ===
        "v1/insights/apps/cpu_percentage",
        "v1/insights/apps/memory_percentage"
    ];
    
    if (!validTypes.includes(type as MetricType)) {
        throw new Error(`Invalid metric type: ${type}. Supported types: ${validTypes.slice(0, 10).join(', ')}... (${validTypes.length} total types)`);
    }
    
    return type as MetricType;
}

/**
 * Validate comparison operator
 */
export function validateComparisonOperator(operator: string): AlertComparisonOperator {
    if (operator !== "GreaterThan" && operator !== "LessThan") {
        throw new Error(`Invalid comparison operator: ${operator}. Must be 'GreaterThan' or 'LessThan'`);
    }
    return operator as AlertComparisonOperator;
}

// Legacy function aliases for backward compatibility
export const validateAlertPolicyType = validateMetricType;
export const validateComparator = validateComparisonOperator;

/**
 * Validate time window
 */
export function validateWindow(window: string): AlertWindow {
    const validWindows: AlertWindow[] = ["5m", "10m", "30m", "1h"];
    
    if (!validWindows.includes(window as AlertWindow)) {
        throw new Error(`Invalid time window: ${window}. Supported windows: ${validWindows.join(', ')}`);
    }
    
    return window as AlertWindow;
}

/**
 * Validate email address format
 */
export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate array of email addresses
 */
export function validateEmails(emails: string[]): void {
    for (const email of emails) {
        if (!validateEmail(email)) {
            throw new Error(`Invalid email address: ${email}`);
        }
    }
}

/**
 * Validate Slack webhook URL
 */
export function validateSlackUrl(url: string): boolean {
    return url.startsWith('https://hooks.slack.com/services/');
}

/**
 * Generate time range for metrics (default: last 1 hour)
 */
export function generateTimeRange(hours: number = 1): { start_time: string; end_time: string } {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000));
    
    return {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
    };
}

/**
 * Time range interface
 */
export interface TimeRange {
    start_time: string;
    end_time: string;
}

/**
 * Common validation patterns
 */
export const VALIDATION_PATTERNS = {
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    SLACK_WEBHOOK: /^https:\/\/hooks\.slack\.com\/services\//,
    DROPLET_ID: /^\d+$/,
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
};

/**
 * Default values for monitoring
 */
export const DEFAULTS = {
    TIME_WINDOW: "1h" as AlertWindow,
    METRICS_HOURS: 1,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
    INVALID_METRIC_TYPE: "Invalid metric type provided",
    INVALID_COMPARISON: "Invalid comparison operator - must be GreaterThan or LessThan", 
    INVALID_WINDOW: "Invalid time window - must be 5m, 10m, 30m, or 1h",
    INVALID_EMAIL: "Invalid email address format",
    INVALID_SLACK_URL: "Invalid Slack webhook URL format",
    MISSING_DROPLET_ID: "Droplet ID is required",
    MISSING_POLICY_UUID: "Alert policy UUID is required",
    API_ERROR: "DigitalOcean API request failed",
    NETWORK_ERROR: "Network request failed",
    TIMEOUT_ERROR: "Request timeout"
};

/**
 * API endpoints
 */
export const API_ENDPOINTS = {
    ALERTS: "/monitoring/alerts",
    SINKS: "/monitoring/sinks", 
    ACCOUNT: "/account",
    DROPLETS: "/droplets",
    METRICS_DROPLET: "/monitoring/metrics/droplet",
    METRICS_VOLUMES: "/monitoring/metrics/volumes",
    METRICS_APPS: "/monitoring/metrics/apps", 
    METRICS_LOAD_BALANCER: "/monitoring/metrics/load_balancer",
    METRICS_DATABASES: "/monitoring/metrics/databases"
};

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

/**
 * Rate limiting and retry configuration
 */
export const RATE_LIMIT = {
    MAX_REQUESTS_PER_SECOND: 10,
    RETRY_AFTER_SECONDS: 60,
    BACKOFF_MULTIPLIER: 2
};
