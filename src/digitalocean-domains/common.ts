import { MonkEntity } from "monkec/base";
import digitalocean from "cloud/digitalocean";

export interface DODomainsDefinitionBase {
    // No API token needed - provider handles authentication
}

export interface DODomainsStateBase {
    existing?: boolean;
}

export abstract class DODomainsEntity<
    D extends DODomainsDefinitionBase,
    S extends DODomainsStateBase
> extends MonkEntity<D, S> {

    protected get(path: string): any {
        const response = digitalocean.get(path, {
            headers: {
                "Accept": "application/json"
            }
        });
        
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`DigitalOcean API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }

    protected post(path: string, body?: any): any {
        const options: any = {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = digitalocean.post(path, options);
        
        // Handle all error status codes uniformly
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`DigitalOcean API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }

    protected put(path: string, body?: any): any {
        const options: any = {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = digitalocean.put(path, options);
        
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`DigitalOcean API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }

    protected deleteRequest(path: string): any {
        const response = digitalocean.delete(path, {
            headers: {
                "Accept": "application/json"
            }
        });
        
        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`DigitalOcean API error: ${response.statusCode} ${response.status} - ${response.body || ''}`);
        }

        return response.body ? JSON.parse(response.body) : {};
    }
}
