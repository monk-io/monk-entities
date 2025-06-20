export type Args = Record<string, string>;

export type MonkContext = {
    status?: Record<string, unknown>;
    args?: Args;
    path: string;
    action: "create" | "start" | "stop" | "purge" | "update" | "check-readiness" | string | undefined;
};

export type DeepReadonly<T> = T extends (infer R)[] ? DeepReadonlyArray<R> : T extends Function ? T : T extends object ? DeepReadonlyObject<T> : T;

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {
}

type DeepReadonlyObject<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
};

export abstract class MonkEntity<D extends object, S extends object> {
    readonly definition: DeepReadonly<D>;
    state: S;
    path: string;

    constructor(definition: D, state: S, ctx: MonkContext | undefined);

    main(ctx: MonkContext): S;

    protected before(): void;

    protected after(): void;

    create(): void;

    start(): void;

    stop(): void;

    update(): void;

    delete(): void;

    checkReadiness(): boolean;

    protected handleUnknownAction(action: string, args?: Args): void;
}

// Decorator to register a method as an action
export function action(actionName?: string): (originalMethod: any, context: ClassMethodDecoratorContext) => any; 