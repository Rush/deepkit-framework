import { ClassType } from '@deepkit/core';
import { ClassSchema } from '@deepkit/type';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ControllerDefinition } from '../model';
import { RpcMessage, RpcMessageReader } from '../protocol';
import { RpcKernel, RpcKernelConnection } from '../server/kernel';
import { RpcMessageWriter, RpcMessageWriterOptions, SingleProgress } from '../writer';
import { RpcActionClient } from './action';
import { RpcMessageSubject } from './message-subject';
export declare class OfflineError extends Error {
    constructor(message?: string);
}
declare type PromisifyFn<T extends ((...args: any[]) => any)> = (...args: Parameters<T>) => ReturnType<T> extends Promise<any> ? ReturnType<T> : Promise<ReturnType<T>>;
export declare type RemoteController<T> = {
    [P in keyof T]: T[P] extends (...args: any[]) => any ? PromisifyFn<T[P]> : never;
};
export interface ObservableDisconnect {
    /**
     * Unsubscribes all active subscriptions and cleans the stored Observable instance on the server.
     * This signals the server that the created observable from the RPC action is no longer needed.
     */
    disconnect(): void;
}
export declare type DisconnectableObservable<T> = Observable<T> & ObservableDisconnect;
export interface TransportConnection {
    send(message: Uint8Array): void;
    bufferedAmount?(): number;
    clientAddress?(): string;
    close(): void;
}
export interface TransportConnectionHooks {
    onConnected(transportConnection: TransportConnection): void;
    onClose(): void;
    onData(buffer: Uint8Array, bytes?: number): void;
    onError(error: any): void;
}
export interface ClientTransportAdapter {
    connect(connection: TransportConnectionHooks): Promise<void> | void;
}
export interface WritableClient {
    sendMessage<T>(type: number, schema?: ClassSchema<T>, body?: T, options?: {
        dontWaitForConnection?: boolean;
        connectionId?: number;
        peerId?: string;
        timeout?: number;
    }): RpcMessageSubject;
}
export declare class RpcClientToken {
    protected token: any;
    constructor(token: any);
    get(): any;
    set(v: any): void;
    has(): boolean;
}
export declare class RpcClientTransporter {
    transport: ClientTransportAdapter;
    protected connectionTries: number;
    connectionId: number;
    protected transportConnection?: TransportConnection;
    protected connectionPromise?: Promise<void>;
    protected connected: boolean;
    protected writer?: RpcMessageWriter;
    writerOptions: RpcMessageWriterOptions;
    id?: Uint8Array;
    /**
     * true when the connection fully established (after authentication)
     */
    readonly connection: BehaviorSubject<boolean>;
    readonly reconnected: Subject<number>;
    readonly disconnected: Subject<number>;
    reader: RpcMessageReader;
    constructor(transport: ClientTransportAdapter);
    bufferedAmount(): number;
    clientAddress(): string;
    /**
     * True when fully connected (after successful handshake and authentication)
     */
    isConnected(): boolean;
    protected onError(): void;
    protected onDisconnect(): void;
    protected onConnect(): void;
    /**
     * Optional handshake.
     * When peer messages are allowed, this needs to request the client id and returns id.
     */
    onHandshake(): Promise<Uint8Array | undefined>;
    onAuthenticate(): Promise<void>;
    onMessage(message: RpcMessage): void;
    disconnect(): void;
    protected doConnect(): Promise<void>;
    /**
     * Simply connect with login using the token, without auto re-connect.
     */
    connect(): Promise<void>;
    send(message: Uint8Array, progress?: SingleProgress): void;
}
export declare class RpcClientPeer {
    protected actionClient: RpcActionClient;
    protected peerId: string;
    protected onDisconnect: (peerId: string) => void;
    constructor(actionClient: RpcActionClient, peerId: string, onDisconnect: (peerId: string) => void);
    controller<T>(nameOrDefinition: string | ControllerDefinition<T>, options?: {
        timeout?: number;
        dontWaitForConnection?: true;
    }): RemoteController<T>;
    disconnect(): void;
}
export declare type RpcEventMessage = {
    id: number;
    date: Date;
    type: number;
    body: any;
};
export declare type RpcClientEventIncomingMessage = {
    event: 'incoming';
    composite: boolean;
    messages: RpcEventMessage[];
} & RpcEventMessage;
export declare type RpcClientEventOutgoingMessage = {
    event: 'outgoing';
    composite: boolean;
    messages: RpcEventMessage[];
} & RpcEventMessage;
export declare type RpcClientEvent = RpcClientEventIncomingMessage | RpcClientEventOutgoingMessage;
export declare class RpcBaseClient implements WritableClient {
    protected transport: ClientTransportAdapter;
    protected messageId: number;
    protected replies: Map<number, (message: RpcMessage) => void>;
    protected actionClient: RpcActionClient;
    readonly token: RpcClientToken;
    readonly transporter: RpcClientTransporter;
    username?: string;
    typeReuseDisabled: boolean;
    events: Subject<RpcClientEvent>;
    constructor(transport: ClientTransportAdapter);
    /**
     * Per default entity types with a name (@entity.name()) will be reused. If a entity with a given name
     * was not loaded and error is thrown. This to ensure nominal typing (object instanceof T).
     * Use this method to disable this behavior and construct new nominal types if an entity is not loaded.
     */
    disableTypeReuse(): this;
    /**
     * The connection process is only finished when this method resolves and doesn't throw.
     * When an error is thrown, the authentication was unsuccessful.
     *
     * If you use controllers in this callback, make sure to use dontWaitForConnection=true, otherwise you get an endless loop.
     *
     * ```typescript
     * async onAuthenticate(): Promise<void> {
     *     const auth = this.controller<AuthController>('auth', {dontWaitForConnection: true});
     *     const result = auth.login('username', 'password');
     *     if (!result) throw new AuthenticationError('Authentication failed);
     * }
     * ```
     */
    protected onAuthenticate(): Promise<void>;
    protected onHandshake(): Promise<Uint8Array | undefined>;
    getId(): Uint8Array;
    protected onMessage(message: RpcMessage): void;
    sendMessage<T>(type: number, schema?: ClassSchema<T>, body?: T, options?: {
        dontWaitForConnection?: boolean;
        connectionId?: number;
        peerId?: string;
        timeout?: number;
    }): RpcMessageSubject;
    connect(): Promise<this>;
    disconnect(): void;
}
export declare class RpcClient extends RpcBaseClient {
    protected registeredAsPeer?: string;
    /**
     * For server->client (us) communication.
     * This is automatically created when registerController is called.
     * Set this property earlier to work with a custom RpcKernel.
     */
    clientKernel?: RpcKernel;
    /**
     * Once the server starts actively with first RPC action for the client,
     * a RPC connection is created.
     */
    protected clientKernelConnection?: RpcKernelConnection;
    /**
     * For peer->client(us) communication.
     * This is automatically created when registerAsPeer is called.
     * Set this property earlier to work with a custom RpcKernel.
     */
    peerKernel?: RpcKernel;
    protected peerConnections: Map<string, RpcClientPeer>;
    protected onHandshake(): Promise<Uint8Array>;
    protected peerKernelConnection: Map<string, RpcKernelConnection>;
    ping(): Promise<void>;
    protected onMessage(message: RpcMessage): void;
    getId(): Uint8Array;
    /**
     * Registers a new controller for the peer's RPC kernel.
     * Use `registerAsPeer` first.
     */
    registerPeerController<T>(nameOrDefinition: string | ControllerDefinition<T>, classType: ClassType<T>): void;
    /**
     * Registers a new controller for the server's RPC kernel.
     * This is when the server wants to communicate actively with the client (us).
     */
    registerController<T>(nameOrDefinition: string | ControllerDefinition<T>, classType: ClassType<T>): void;
    registerAsPeer(id: string): Promise<{
        deregister: () => Promise<void>;
    }>;
    /**
     * Creates a new peer connection, or re-uses an existing non-disconnected one.
     *
     * Make sure to call disconnect() on it once you're done using it, otherwise the peer
     * will leak memory. (connection will be dropped if idle for too long automatically tough)
     */
    peer(peerId: string): RpcClientPeer;
    controller<T>(nameOrDefinition: string | ControllerDefinition<T>, options?: {
        timeout?: number;
        dontWaitForConnection?: true;
        typeReuseDisabled?: boolean;
    }): RemoteController<T>;
}
export {};
