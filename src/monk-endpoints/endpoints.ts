import cli from "cli";
import { action, MonkEntity } from "monkec/base";

export interface EndpointDefinition {
    /**
     * Public URL for this endpoint.
     * @description Fully qualified URL or host value resolved through template expressions.
     */
    url: string;

    /**
     * Human readable endpoint description (optional).
     * @description Brief text explaining endpoint purpose.
     */
    description?: string;
}

/**
 * Definition interface for Endpoints entity.
 * Configures the endpoint map and entrypoint.
 * @interface EndpointsDefinition
 */
export interface EndpointsDefinition {
    /**
     * @description Endpoint key used as the default entrypoint.
     */
    entrypoint: string;

    /**
     * @description Named endpoint map; each item defines a single `url`.
     */
    endpoints: Record<string, EndpointDefinition>;
}

export interface ResolvedEndpoint {
    name: string;
    url?: string;
    description?: string;
    ready: boolean;
}

/**
 * State interface for Endpoints entity.
 * Contains resolved endpoint values and entrypoint status.
 * @interface EndpointsState
 */
export interface EndpointsState {
    /**
     * @description Endpoint key selected as default entrypoint.
     */
    entrypoint?: string;

    /**
     * @description Resolved URL for the selected entrypoint.
     */
    entrypoint_url?: string;

    /**
     * @description True when entrypoint URL is present and passes HTTP(S) URL validation.
     */
    ready?: boolean;

    /**
     * @description Flattened endpoint list for composition and debugging.
     */
    endpoints?: ResolvedEndpoint[];
}

/**
 * @description MonkEC Endpoints entity.
 * Collects and normalizes endpoint URLs from connected entities and exposes a single entrypoint.
 * Keeps endpoint definitions simple by using one `url` property per endpoint key.
 *
 * ## Secrets
 * - Reads: none
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.entrypoint_url` - Default URL to open/use
 * - `state.endpoints` - All resolved endpoint URLs
 * - `state.ready` - Readiness flag for entrypoint URL population
 *
 * ## Composing with Other Entities
 * Works with:
 * - `netlify/site` - Consume `state.url`
 * - `vercel/project` - Consume `state.url`
 * - `cloudflare/cloudflare-tunnel-application` - Consume `state.hostname`
 */
export class Endpoints extends MonkEntity<EndpointsDefinition, EndpointsState> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 60 } as const;

    override create(): void {
        this.syncState();
    }

    override update(): void {
        this.syncState();
    }

    override checkReadiness(): boolean {
        this.syncState();
        return Boolean(this.state.ready);
    }

    override checkLiveness(): boolean {
        return true;
    }

    @action("refresh")
    refresh(): void {
        this.syncState();
        cli.output(`Refreshed endpoints. Entrypoint URL: ${this.state.entrypoint_url || "<empty>"}`);
    }

    private syncState(): void {
        const endpointsMap = this.definition.endpoints || {};
        const resolved: ResolvedEndpoint[] = [];

        for (const [name, endpoint] of Object.entries(endpointsMap)) {
            const url = (endpoint?.url || "").trim();
            const isValid = this.isValidEndpointUrl(url);
            resolved.push({
                name,
                url: url || undefined,
                description: endpoint?.description,
                ready: isValid,
            });
        }

        const entrypoint = this.definition.entrypoint;
        const selected = resolved.find((ep) => ep.name === entrypoint);
        const entrypointUrl = selected?.url;
        const entrypointReady = Boolean(selected?.ready);

        this.state.entrypoint = entrypoint;
        this.state.entrypoint_url = entrypointUrl;
        this.state.ready = entrypointReady;
        this.state.endpoints = resolved;
    }

    private isValidEndpointUrl(url: string): boolean {
        if (!url) return false;

        // Require full HTTP(S) URL with a non-empty host and optional valid port.
        // Examples rejected: "http://:8080", "https://", "example.com".
        const match = url.match(/^(https?):\/\/([^/\s?#:]+|\[[0-9a-fA-F:]+\])(?::([0-9]{1,5}))?(?:[/?#].*)?$/);
        if (!match) return false;

        const host = match[2];
        if (!host || host.trim().length === 0) return false;

        const portRaw = match[3];
        if (portRaw) {
            const port = parseInt(portRaw, 10);
            if (Number.isNaN(port) || port < 1 || port > 65535) return false;
        }

        return true;
    }
}
