import crypto from "crypto";

const BuiltinActions = [
    "create",
    "start",
    "stop",
    "purge",
    "update",
    "check-readiness",
] as const;

export type Args = Record<string, string>;

export type Metadata = Record<string, string>;

// Symbol to store action metadata
const ACTION_METADATA_KEY = Symbol("monk:actions");

// Convert camelCase to kebab-case
function camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Decorator to register a method as an action
 * @param actionName - Optional custom action name, defaults to kebab-case of method name
 */
export function action(actionName?: string) {
    return function (originalMethod: any, context: ClassMethodDecoratorContext) {
        const propertyKey = String(context.name);
        const name = actionName || camelToKebab(propertyKey);

        context.addInitializer(function (this: any) {
            const actions = this[ACTION_METADATA_KEY] || new Map<string, string>();
            actions.set(name, propertyKey);
            this[ACTION_METADATA_KEY] = actions;
        });

        return originalMethod;
    };
}

/**
 * Context object passed to Monk operations containing optional arguments
 */
export type MonkContext = {
    /** Entity state, untyped */
    status?: Record<string, unknown>;
    /** Optional arguments passed to the operation */
    args?: Args;
    /** Optional metadata passed to the operation */
    metadata?: Metadata;
    /** Path to the entity */
    path: string;
    /** Action to perform */
    action: (typeof BuiltinActions)[number] | string | undefined;
};

export type DeepReadonly<T> = T extends (infer R)[]
    ? DeepReadonlyArray<R>
    : T extends Function
        ? T
        : T extends object
            ? DeepReadonlyObject<T>
            : T;

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {
}

type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
};

/**
 * Base abstract class for all Monk entities
 * @template D - The definition type for the entity
 * @template S - The state type for the entity
 */
export abstract class MonkEntity<D extends object, S extends object> {
    /** The entity definition */
    readonly definition: DeepReadonly<D>;

    /** The entity state */
    state: S;

    path: string;

    metadata?: Metadata;

    /**
     * Creates a new MonkEntity instance
     * @param definition - The entity definition
     * @param state - The entity state
     * @param ctx - The context object
     */
    constructor(definition: D, state: S, ctx: MonkContext | undefined) {
        this.definition = definition as DeepReadonly<D>;
        this.state = state;
        this.path = ctx?.path || "";
    }

    /**
     * Main entry point called by the Monk runtime
     * @param ctx - The context object
     * @returns The updated state
     */
    main(ctx: MonkContext): S {
        const action = ctx.action;
        if (ctx.metadata) {
            this.metadata = ctx.metadata;
        }

        if (!action) {
            console.log("No action provided");
            return this.state;
        }

        // Call before hook if implemented
        if (this.isMethodImplemented("before")) {
            this.before();
        }

        try {
            // 1. Try built-in actions (only if implemented)
            if (this.tryBuiltinAction(action, ctx.args)) {
                return this.state;
            }

            // 2. Try registered @action methods
            if (this.tryRegisteredAction(action, ctx.args)) {
                return this.state;
            }

            // 3. Fall back to catch-all method
            this.handleUnknownAction(action, ctx.args);
            return this.state;
        } finally {
            // Call after hook if implemented, but don't let exceptions in after() mask original exceptions
            if (this.isMethodImplemented("after")) {
                try {
                    this.after();
                } catch (afterError) {
                    // Log the error but don't throw it to avoid masking the original exception
                    console.error("Error in after() hook:", afterError);
                }
            }
        }
    }

    /**
     * Try to execute a built-in action if it's implemented
     */
    private tryBuiltinAction(action: string, _args?: Args): boolean {
        switch (action) {
            case "create":
                if (this.isMethodImplemented("create")) {
                    this.create();
                    // After successful create, persist the current definition hash
                    if (this.isIdempotentUpdateEnabled()) {
                        const hashAfterCreate = this.computeDefinitionHash();
                        (this.state as any).definition_hash = hashAfterCreate;
                    }
                    return true;
                }
                break;
            case "start":
                if (this.isMethodImplemented("start")) {
                    this.start();
                    return true;
                }
                break;
            case "stop":
                if (this.isMethodImplemented("stop")) {
                    this.stop();
                    return true;
                }
                break;
            case "purge":
                if (this.isMethodImplemented("delete")) {
                    this.delete();
                    return true;
                }
                break;
            case "update":
                if (this.isMethodImplemented("update")) {
                    if (this.isIdempotentUpdateEnabled()) {
                        const currentHash = this.computeDefinitionHash();
                        const previousHash = (this.state as any).definition_hash as string | undefined;
                        if (previousHash && previousHash === currentHash) {
                            // No changes; skip subclass update
                            console.log("No definition changes detected; skipping update");
                            return true;
                        }
                        // Run subclass update and then persist new hash
                        this.update();
                        (this.state as any).definition_hash = currentHash;
                        return true;
                    }
                    // If idempotence disabled, always call update
                    this.update();
                    return true;
                }
                break;
            case "check-readiness":
                if (this.isMethodImplemented("checkReadiness")) {
                    const isReady = this.checkReadiness();
                    if (!isReady) {
                        throw new Error("not ready");
                    }
                    return true;
                }
                break;
        }
        return false;
    }

    /**
     * Try to execute a registered @action method
     */
    private tryRegisteredAction(action: string, args?: Args): boolean {
        const actions = this.getRegisteredActions();
        const methodName = actions.get(action);

        if (methodName && typeof (this as any)[methodName] === "function") {
            (this as any)[methodName].call(this, args);
            return true;
        }

        return false;
    }

    /**
     * Get all registered actions from the instance
     */
    private getRegisteredActions(): Map<string, string> {
        const actions = (this as any)[ACTION_METADATA_KEY];
        if (actions instanceof Map) {
            return new Map(actions); // Return a copy to prevent external modification
        }
        return new Map<string, string>();
    }

    /**
     * Check if a method has been overridden from the base implementation
     */
    private isMethodImplemented(methodName: string): boolean {
        const method = (this as any)[methodName];
        if (typeof method !== "function") {
            return false;
        }

        // Check if the method has been overridden by comparing with base class
        const baseMethod = (MonkEntity.prototype as any)[methodName];
        return method !== baseMethod;
    }

    /**
     * Handle unknown actions - can be overridden by subclasses
     */
    protected handleUnknownAction(action: string, _args?: Args): void {
        console.log(`Action ${action} not defined`);
    }

    /**
     * Called before action execution - can be overridden by subclasses
     * Useful for common setup like reading secrets, initializing connections, etc.
     */
    protected before(): void {
        // Default implementation does nothing
    }

    /**
     * Called after action execution - can be overridden by subclasses
     * Useful for common teardown like closing connections, cleanup, etc.
     */
    protected after(): void {
        // Default implementation does nothing
    }

    /**
     * Creates the entity
     * Override in subclasses if needed
     */
    create(): void {
        // Default implementation does nothing
    }

    /**
     * Starts the entity
     * Override in subclasses if needed
     */
    start(): void {
        // Default implementation does nothing
    }

    /**
     * Stops the entity
     * Override in subclasses if needed
     */
    stop(): void {
        // Default implementation does nothing
    }

    /**
     * Updates the entity
     * Override in subclasses if needed
     */
    update(): void {
        // Default implementation does nothing
    }

    /**
     * Deletes the entity
     * Override in subclasses if needed
     */
    delete(): void {
        // Default implementation does nothing
    }

    /**
     * Checks if the entity is ready
     * Override in subclasses if needed
     * @returns True if the entity is ready
     */
    checkReadiness(): boolean {
        // Default implementation returns true
        return true;
    }

    /**
     * Whether base-level idempotent update short-circuiting by definition hash is enabled.
     * Subclasses can override to opt-out for providers that require always-on reconciliation.
     */
    protected isIdempotentUpdateEnabled(): boolean {
        return true;
    }

    /**
     * Allows subclasses to customize what participates in the idempotence hash.
     * Default: current definition bundled with optional metadata version signals.
     */
    protected getDefinitionForHash(): unknown {
        const meta = this.metadata || {};
        return {
            __meta__: {
                version: meta.version || "",
                version_hash: (meta as any)["version-hash"] || "",
            },
            definition: this.definition,
        } as const;
    }

    /** Compute a stable SHA-256 hash of the hash material returned by getDefinitionForHash(). */
    private computeDefinitionHash(): string {
        const material = this.getDefinitionForHash();
        const canonical = MonkEntity.canonicalStringify(material);
        return crypto.sha256(canonical);
    }

    /** Stable stringify that sorts object keys recursively for deterministic hashing. */
    private static canonicalStringify(value: unknown): string {
        if (Array.isArray(value)) {
            return `[${value.map(v => MonkEntity.canonicalStringify(v)).join(',')}]`;
        }
        if (value && typeof value === "object") {
            const entries = Object.entries(value as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
            return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${MonkEntity.canonicalStringify(v)}`).join(',')}}`;
        }
        return JSON.stringify(value);
    }
} 