/**
 * GCP IAP Common Helpers
 *
 * Shared constants and utilities for GCP Identity-Aware Proxy entities.
 */

import gcp from "cloud/gcp";
import { RESOURCE_MANAGER_API_URL } from "./common.ts";

/** IAP REST API base URL */
export const IAP_API_URL = "https://iap.googleapis.com/v1";

/**
 * Kinds of IAP-protected resources supported by iap-settings and iap-access-policy.
 * See https://cloud.google.com/iap/docs/managing-access for path formats.
 */
export type IapTargetKind =
    | "app-engine"
    | "app-engine-service"
    | "compute"
    | "compute-regional"
    | "cloud-run"
    | "project"
    | "organization"
    | "folder"
    | "raw";

/**
 * Target descriptor fields mixed into entity definitions that need to address
 * an IAP-protected resource.
 */
export interface IapTarget {
    /**
     * @description Kind of IAP-protected resource. Selects which other target_* fields apply.
     */
    target_kind: IapTargetKind;

    /**
     * @description App Engine application ID (for target_kind: app-engine, app-engine-service)
     */
    app_id?: string;

    /**
     * @description App Engine service name (for target_kind: app-engine-service)
     */
    app_engine_service?: string;

    /**
     * @description Compute Engine backend service ID (for target_kind: compute, compute-regional)
     */
    backend_service?: string;

    /**
     * @description GCP region (for target_kind: compute-regional, cloud-run)
     */
    region?: string;

    /**
     * @description Cloud Run service name (for target_kind: cloud-run)
     */
    cloud_run_service?: string;

    /**
     * @description Organization numeric ID (for target_kind: organization)
     */
    organization_id?: string;

    /**
     * @description Folder numeric ID (for target_kind: folder)
     */
    folder_id?: string;

    /**
     * @description Verbatim IAP resource path (for target_kind: raw)
     */
    resource_path?: string;
}

/**
 * Resolve a GCP project ID to its numeric project number.
 * IAP paths under `iap_web` use the project NUMBER, not the project ID.
 */
export function resolveProjectNumber(projectId: string): string {
    const url = `${RESOURCE_MANAGER_API_URL}/projects/${projectId}`;
    const response = gcp.get(url);
    if (response.error || response.statusCode >= 400) {
        throw new Error(
            `Failed to resolve project number for ${projectId} (status ${response.statusCode}): ${response.body}`
        );
    }
    const data = JSON.parse(response.body || "{}");
    if (!data.projectNumber) {
        throw new Error(`Project ${projectId} has no projectNumber in Resource Manager response`);
    }
    return String(data.projectNumber);
}

/**
 * Build the full IAP-protected resource path for a given target.
 * Paths follow the conventions documented at
 * https://cloud.google.com/iap/docs/managing-access
 */
export function buildIapTargetPath(target: IapTarget, projectNumber: string): string {
    switch (target.target_kind) {
        case "raw": {
            if (!target.resource_path) {
                throw new Error("resource_path is required for target_kind=raw");
            }
            return target.resource_path;
        }
        case "project":
            return `projects/${projectNumber}/iap_web`;
        case "organization": {
            if (!target.organization_id) {
                throw new Error("organization_id is required for target_kind=organization");
            }
            return `organizations/${target.organization_id}/iap_web`;
        }
        case "folder": {
            if (!target.folder_id) {
                throw new Error("folder_id is required for target_kind=folder");
            }
            return `folders/${target.folder_id}/iap_web`;
        }
        case "app-engine": {
            if (!target.app_id) {
                throw new Error("app_id is required for target_kind=app-engine");
            }
            return `projects/${projectNumber}/iap_web/appengine-${target.app_id}`;
        }
        case "app-engine-service": {
            if (!target.app_id || !target.app_engine_service) {
                throw new Error(
                    "app_id and app_engine_service are required for target_kind=app-engine-service"
                );
            }
            return `projects/${projectNumber}/iap_web/appengine-${target.app_id}/services/${target.app_engine_service}`;
        }
        case "compute": {
            if (!target.backend_service) {
                throw new Error("backend_service is required for target_kind=compute");
            }
            return `projects/${projectNumber}/iap_web/compute/services/${target.backend_service}`;
        }
        case "compute-regional": {
            if (!target.backend_service || !target.region) {
                throw new Error(
                    "backend_service and region are required for target_kind=compute-regional"
                );
            }
            return `projects/${projectNumber}/iap_web/compute-${target.region}/services/${target.backend_service}`;
        }
        case "cloud-run": {
            if (!target.cloud_run_service || !target.region) {
                throw new Error(
                    "cloud_run_service and region are required for target_kind=cloud-run"
                );
            }
            return `projects/${projectNumber}/iap_web/cloud_run-${target.region}/services/${target.cloud_run_service}`;
        }
        default:
            throw new Error(`Unknown target_kind: ${String((target as IapTarget).target_kind)}`);
    }
}

/**
 * State cache slots used by resolveIapResourceName.
 * Both iap-settings and iap-access-policy persist the resolved resource path
 * and project number in these state fields to avoid repeated lookups.
 */
export interface IapResourceNameCache {
    resource_name?: string;
    project_number?: string;
}

/**
 * Target kinds whose resource path contains `projects/{projectNumber}/iap_web/...`
 * and therefore require Resource Manager lookup. Organization/folder/raw targets
 * do not need the project number — avoid the API call (and the extra IAM
 * permission requirement) for those.
 */
const TARGET_KINDS_NEEDING_PROJECT_NUMBER: ReadonlySet<IapTargetKind> = new Set<IapTargetKind>([
    "project",
    "app-engine",
    "app-engine-service",
    "compute",
    "compute-regional",
    "cloud-run",
]);

/**
 * Resolve (and cache in state) the full IAP resource path for a target.
 * Shared by iap-settings and iap-access-policy so the caching + target-path
 * construction isn't duplicated. The project number is resolved lazily — only
 * for target kinds whose path actually uses it.
 */
export function resolveIapResourceName(
    target: IapTarget,
    cache: IapResourceNameCache,
    projectId: string,
): string {
    if (cache.resource_name) return cache.resource_name;

    let projectNumber = cache.project_number || "";
    if (TARGET_KINDS_NEEDING_PROJECT_NUMBER.has(target.target_kind) && !projectNumber) {
        projectNumber = resolveProjectNumber(projectId);
        cache.project_number = projectNumber;
    }

    const name = buildIapTargetPath(target, projectNumber);
    cache.resource_name = name;
    return name;
}

/**
 * Collect second-level field paths (e.g. "accessSettings.oauthSettings") for objects
 * where only top-level keys with non-undefined values are set.
 *
 * Used to produce the updateMask for PATCH requests to iapSettings.
 */
export function collectUpdateMaskPaths(obj: Record<string, unknown>): string[] {
    const paths: string[] = [];
    for (const topKey of Object.keys(obj)) {
        const topVal = obj[topKey];
        if (topVal === undefined) continue;
        if (topVal !== null && typeof topVal === "object" && !Array.isArray(topVal)) {
            const sub = topVal as Record<string, unknown>;
            const subKeys = Object.keys(sub).filter(k => sub[k] !== undefined);
            if (subKeys.length === 0) {
                paths.push(topKey);
            } else {
                for (const k of subKeys) {
                    paths.push(`${topKey}.${k}`);
                }
            }
        } else {
            paths.push(topKey);
        }
    }
    return paths;
}
