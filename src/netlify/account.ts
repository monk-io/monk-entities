import { NetlifyEntity, NetlifyEntityDefinition, NetlifyEntityState } from "./netlify-base.ts";
import cli from "cli";

/**
 * Account entity definition
 */
export interface AccountDefinition extends NetlifyEntityDefinition {}

/**
 * Account entity state
 */
export interface AccountState extends NetlifyEntityState {
    accounts?: string[];
    existing?: boolean;
}

/**
 * Account Entity
 * 
 * Simple entity that lists all accounts for the current user.
 * Uses the Netlify API to fetch account information and stores account slugs in state.
 */
export class Account extends NetlifyEntity<AccountDefinition, AccountState> {
    
    protected getEntityName(): string {
        return "Netlify Account";
    }
    
    /**
     * Create/update the account entity
     * Fetches accounts from Netlify API and stores slugs in state
     */
    override create(): void {
        // Fetch accounts from Netlify API
        const accounts = this.makeRequest("GET", "/accounts");
        const slugs = Array.isArray(accounts) ? accounts.map((a: any) => a.slug) : [];
        this.state = {
            accounts: slugs,
            existing: true
        };
        cli.output(`Found ${slugs.length} account(s)`);
    }
    
    /**
     * Update the account entity
     * Refreshes accounts from API
     */
    override update(): void {
        this.create();
    }
    
    /**
     * Delete the account entity
     * Since this is just a read-only entity, deletion is a no-op
     */
    override delete(): void {
        this.state = {
            accounts: [],
            existing: false
        };
        cli.output("Account entity is read-only - no deletion needed");
    }
    
    /**
     * Check if the account entity is ready
     */
    override checkReadiness(): boolean {
        return true;
    }
} 