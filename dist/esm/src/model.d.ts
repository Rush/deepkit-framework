import { ClassType, CustomError } from '@deepkit/core';
import { BehaviorSubject, Observable, Subject, TeardownLogic } from 'rxjs';
export declare type IdType = string | number;
export interface IdInterface {
    id: IdType;
}
export interface IdVersionInterface extends IdInterface {
    version: number;
}
export declare class ConnectionWriter {
    write(buffer: Uint8Array): void;
}
export declare class StreamBehaviorSubject<T> extends BehaviorSubject<T> {
    readonly appendSubject: Subject<T>;
    protected nextChange?: Subject<void>;
    protected nextOnAppend: boolean;
    protected unsubscribed: boolean;
    protected teardowns: TeardownLogic[];
    constructor(item: T, teardown?: TeardownLogic);
    isUnsubscribed(): boolean;
    get nextStateChange(): Promise<void>;
    addTearDown(teardown: TeardownLogic): void;
    /**
     * This method differs to BehaviorSubject in the way that this does not throw an error
     * when the subject is closed/unsubscribed.
     */
    getValue(): T;
    next(value: T): void;
    activateNextOnAppend(): void;
    toUTF8(): StreamBehaviorSubject<string>;
    append(value: T): void;
    unsubscribe(): void;
}
declare const IsEntitySubject: unique symbol;
export declare function isEntitySubject(v: any): v is EntitySubject<any>;
export declare class EntitySubject<T extends IdInterface> extends StreamBehaviorSubject<T> {
    /**
     * Patches are in class format.
     */
    readonly patches: Subject<EntityPatch>;
    readonly delete: Subject<boolean>;
    [IsEntitySubject]: boolean;
    deleted: boolean;
    get id(): string | number;
    get onDeletion(): Observable<void>;
    next(value: T | undefined): void;
}
export declare class ControllerDefinition<T> {
    path: string;
    entities: ClassType[];
    constructor(path: string, entities?: ClassType[]);
}
export declare function ControllerSymbol<T>(path: string, entities?: ClassType[]): ControllerDefinition<T>;
export declare class JSONError {
    readonly json: any;
    constructor(json: any);
}
export declare class ValidationErrorItem {
    readonly path: string;
    readonly code: string;
    readonly message: string;
    constructor(path: string, code: string, message: string);
    toString(): string;
}
export declare class ValidationError extends CustomError {
    readonly errors: ValidationErrorItem[];
    constructor(errors: ValidationErrorItem[]);
    static from(errors: {
        path: string;
        message: string;
        code?: string;
    }[]): ValidationError;
}
export declare class ValidationParameterError {
    readonly controller: string;
    readonly action: string;
    readonly arg: number;
    readonly errors: ValidationErrorItem[];
    constructor(controller: string, action: string, arg: number, errors: ValidationErrorItem[]);
    get message(): string;
}
export declare enum RpcTypes {
    Ack = 0,
    Error = 1,
    Chunk = 2,
    ChunkAck = 3,
    Ping = 4,
    Pong = 5,
    Authenticate = 6,
    ActionType = 7,
    Action = 8,
    PeerRegister = 9,
    PeerDeregister = 10,
    ClientId = 11,
    ClientIdResponse = 12,
    AuthenticateResponse = 13,
    ResponseActionType = 14,
    ResponseActionReturnType = 15,
    ResponseActionSimple = 16,
    ResponseActionResult = 17,
    ActionObservableSubscribe = 18,
    ActionObservableUnsubscribe = 19,
    ActionObservableDisconnect = 20,
    ActionObservableSubjectUnsubscribe = 21,
    ResponseActionObservable = 22,
    ResponseActionBehaviorSubject = 23,
    ResponseActionObservableNext = 24,
    ResponseActionObservableComplete = 25,
    ResponseActionObservableError = 26,
    ActionCollectionUnsubscribe = 27,
    ActionCollectionModel = 28,
    ResponseActionCollection = 29,
    ResponseActionCollectionModel = 30,
    ResponseActionCollectionSort = 31,
    ResponseActionCollectionState = 32,
    ResponseActionCollectionChange = 33,
    ResponseActionCollectionSet = 34,
    ResponseActionCollectionAdd = 35,
    ResponseActionCollectionRemove = 36,
    ResponseActionCollectionUpdate = 37,
    ResponseEntity = 38,
    Entity = 39,
    EntityPatch = 40,
    EntityRemove = 41
}
export declare const rpcClientId: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    id: import("@deepkit/type").FieldDecoratorResult<Uint8Array>;
}>>;
export declare const rpcChunk: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    id: import("@deepkit/type").FieldDecoratorResult<number>;
    total: import("@deepkit/type").FieldDecoratorResult<number>;
    v: import("@deepkit/type").FieldDecoratorResult<Uint8Array>;
}>>;
export declare const rpcActionObservableSubscribeId: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    id: import("@deepkit/type").FieldDecoratorResult<number>;
}>>;
export declare const rpcError: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    classType: import("@deepkit/type").FieldDecoratorResult<string>;
    message: import("@deepkit/type").FieldDecoratorResult<string>;
    stack: import("@deepkit/type").FieldDecoratorResult<string>;
    properties: import("@deepkit/type").FieldDecoratorResult<{
        [name: string]: any;
    } | undefined>;
}>>;
export declare const rpcResponseActionObservableSubscriptionError: import("@deepkit/type").ClassSchema<{
    classType: string;
    message: string;
    stack: string;
} & {
    properties?: {
        [name: string]: any;
    } | undefined;
} & {
    id: number;
} & {}>;
export declare enum ActionObservableTypes {
    observable = 0,
    subject = 1,
    behaviorSubject = 2
}
export declare const rpcSort: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    field: import("@deepkit/type").FieldDecoratorResult<string>;
    direction: import("@deepkit/type").FieldDecoratorResult<"asc" | "desc">;
}>>;
export declare const rpcResponseActionObservable: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    type: import("@deepkit/type").FieldDecoratorResult<ActionObservableTypes>;
}>>;
export declare const rpcAuthenticate: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    token: import("@deepkit/type").FieldDecoratorResult<any>;
}>>;
export declare const rpcResponseAuthenticate: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    username: import("@deepkit/type").FieldDecoratorResult<string>;
}>>;
export declare const rpcAction: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    controller: import("@deepkit/type").FieldDecoratorResult<string>;
    method: import("@deepkit/type").FieldDecoratorResult<string>;
}>>;
export declare const rpcActionType: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    controller: import("@deepkit/type").FieldDecoratorResult<string>;
    method: import("@deepkit/type").FieldDecoratorResult<string>;
    disableTypeReuse: import("@deepkit/type").FieldDecoratorResult<boolean | undefined>;
}>>;
export declare const rpcResponseActionType: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    parameters: import("@deepkit/type").FieldDecoratorResult<import("@deepkit/type").PropertySchemaSerialized[]>;
    result: import("@deepkit/type").FieldDecoratorResult<import("@deepkit/type").PropertySchemaSerialized>;
    next: import("@deepkit/type").FieldDecoratorResult<import("@deepkit/type").PropertySchemaSerialized | undefined>;
}>>;
export declare const rpcPeerRegister: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    id: import("@deepkit/type").FieldDecoratorResult<string>;
}>>;
export declare const rpcPeerDeregister: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    id: import("@deepkit/type").FieldDecoratorResult<string>;
}>>;
export declare const rpcResponseActionCollectionRemove: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    ids: import("@deepkit/type").FieldDecoratorResult<(string | number)[]>;
}>>;
export declare const rpcResponseActionCollectionSort: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    ids: import("@deepkit/type").FieldDecoratorResult<(string | number)[]>;
}>>;
export declare const rpcEntityRemove: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    entityName: import("@deepkit/type").FieldDecoratorResult<string>;
    ids: import("@deepkit/type").FieldDecoratorResult<(string | number)[]>;
}>>;
export interface EntityPatch {
    $set?: {
        [path: string]: any;
    };
    $unset?: {
        [path: string]: number;
    };
    $inc?: {
        [path: string]: number;
    };
}
export declare const rpcEntityPatch: import("@deepkit/type").ClassSchema<import("@deepkit/type").ExtractClassDefinition<{
    entityName: import("@deepkit/type").FieldDecoratorResult<string>;
    id: import("@deepkit/type").FieldDecoratorResult<string | number>;
    version: import("@deepkit/type").FieldDecoratorResult<number>;
    patch: import("@deepkit/type").FieldDecoratorResult<import("@deepkit/type").ExtractClassDefinition<{
        $set: import("@deepkit/type").FieldDecoratorResult<{
            [name: string]: any;
        } | undefined>;
        $unset: import("@deepkit/type").FieldDecoratorResult<{
            [name: string]: number;
        } | undefined>;
        $inc: import("@deepkit/type").FieldDecoratorResult<{
            [name: string]: number;
        } | undefined>;
    }>>;
}>>;
export declare class AuthenticationError extends Error {
    constructor(message?: string);
}
export {};
