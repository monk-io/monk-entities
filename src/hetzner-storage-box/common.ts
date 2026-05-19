import { MonkEntity } from "monkec/base";
import hetzner from "cloud/hetzner";

// Storage boxes use a separate Hetzner API endpoint (api.hetzner.com, not api.hetzner.cloud)
const HETZNER_API = "https://api.hetzner.com/v1";

export interface HetznerStorageBoxBase {}

export abstract class HetznerStorageBoxEntity<
    D extends HetznerStorageBoxBase,
    S extends HetznerStorageBoxBase
> extends MonkEntity<D, S> {

    protected get(path: string): any {
        const response = hetzner.do(`${HETZNER_API}${path}`, {
            method: "GET",
            headers: { "Accept": "application/json" }
        });
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner Cloud API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response.body ? JSON.parse(response.body) : {};
    }

    protected post(path: string, body?: any): any {
        const response = hetzner.do(`${HETZNER_API}${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner Cloud API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response.body ? JSON.parse(response.body) : {};
    }

    protected put(path: string, body?: any): any {
        const response = hetzner.do(`${HETZNER_API}${path}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner Cloud API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response.body ? JSON.parse(response.body) : {};
    }

    protected deleteRequest(path: string): any {
        const response = hetzner.do(`${HETZNER_API}${path}`, {
            method: "DELETE",
            headers: { "Accept": "application/json" }
        });
        if (response.statusCode >= 400) {
            throw new Error(`Hetzner Cloud API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }
        return response.body ? JSON.parse(response.body) : {};
    }
}
