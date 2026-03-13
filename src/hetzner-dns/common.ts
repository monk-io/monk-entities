import { MonkEntity } from "monkec/base";
import hetzner from "cloud/hetzner";

export interface HetznerDNSDefinitionBase {
    // No API token needed - provider handles authentication
}

export interface HetznerDNSStateBase {
    existing?: boolean;
}

export abstract class HetznerDNSEntity<
    D extends HetznerDNSDefinitionBase,
    S extends HetznerDNSStateBase
> extends MonkEntity<D, S> {

    // Hetzner DNS API is at dns.hetzner.com, not api.hetzner.cloud
    // We use the hetzner cloud module but need to pass full URLs for DNS API
    private readonly DNS_API = "https://dns.hetzner.com/api/v1";

    protected get(path: string): any {
        const response = hetzner.do(`${this.DNS_API}${path}`, {
            method: "GET",
            headers: {
                "Accept": "application/json"
            }
        });

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner DNS API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }

    protected post(path: string, body?: any): any {
        const options: any = {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = hetzner.do(`${this.DNS_API}${path}`, options);

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner DNS API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }

    protected put(path: string, body?: any): any {
        const options: any = {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = hetzner.do(`${this.DNS_API}${path}`, options);

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner DNS API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }

    protected deleteRequest(path: string): any {
        const response = hetzner.do(`${this.DNS_API}${path}`, {
            method: "DELETE",
            headers: {
                "Accept": "application/json"
            }
        });

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Hetzner DNS API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }
}
