import { ClassType } from '@deepkit/core';
import { ClassSchema } from '@deepkit/type';
import { RpcMessageSubject } from '../client/message-subject';
import { ControllerDefinition, RpcTypes } from '../model';
import { RpcCreateMessageDef, RpcMessage, RpcMessageReader, RpcMessageRouteType } from '../protocol';
import { RpcMessageWriter, RpcMessageWriterOptions } from '../writer';
import { RpcServerAction } from './action';
import { RpcKernelSecurity, SessionState } from './security';
import { RpcActionClient } from '../client/action';
import { RemoteController } from '../client/client';
import { InjectorContext, InjectorModule } from '@deepkit/injector';
import { LoggerInterface } from '@deepkit/logger';
export declare class RpcCompositeMessage {
    type: number;
    protected id: number;
    protected writer: RpcConnectionWriter;
    protected clientId?: Uint8Array | undefined;
    protected source?: Uint8Array | undefined;
    protected routeType: RpcMessageRouteType.client | RpcMessageRouteType.server;
    protected messages: RpcCreateMessageDef<any>[];
    constructor(type: number, id: number, writer: RpcConnectionWriter, clientId?: Uint8Array | undefined, source?: Uint8Array | undefined, routeType?: RpcMessageRouteType.client | RpcMessageRouteType.server);
    add<T>(type: number, schema?: ClassSchema<T> | ClassType<T>, body?: T): this;
    send(): void;
}
export declare class RpcMessageBuilder {
    protected writer: RpcConnectionWriter;
    protected id: number;
    protected clientId?: Uint8Array | undefined;
    protected source?: Uint8Array | undefined;
    routeType: RpcMessageRouteType.client | RpcMessageRouteType.server;
    constructor(writer: RpcConnectionWriter, id: number, clientId?: Uint8Array | undefined, source?: Uint8Array | undefined);
    protected messageFactory<T>(type: RpcTypes, schemaOrBody?: ClassSchema<T> | Uint8Array, data?: T): Uint8Array;
    ack(): void;
    error(error: Error | string): void;
    reply<T>(type: number, schemaOrBody?: ClassSchema<T> | Uint8Array, body?: T): void;
    composite(type: number): RpcCompositeMessage;
}
/**
 * This is a reference implementation and only works in a single process.
 * A real-life implementation would use an external message-bus, like Redis & co.
 */
export declare class RpcPeerExchange {
    protected registeredPeers: Map<string, RpcConnectionWriter>;
    isRegistered(id: string): Promise<boolean>;
    deregister(id: string | Uint8Array): Promise<void>;
    register(id: string | Uint8Array, writer: RpcConnectionWriter): void;
    redirect(message: RpcMessage): void;
}
export interface RpcConnectionWriter {
    write(buffer: Uint8Array): void;
    close(): void;
    bufferedAmount?(): number;
    clientAddress?(): string;
}
export declare abstract class RpcKernelBaseConnection {
    protected transportWriter: RpcConnectionWriter;
    protected connections: RpcKernelConnections;
    protected messageId: number;
    sessionState: SessionState;
    protected reader: RpcMessageReader;
    protected actionClient: RpcActionClient;
    protected id: Uint8Array;
    protected replies: Map<number, (message: RpcMessage) => void>;
    writerOptions: RpcMessageWriterOptions;
    writer: RpcMessageWriter;
    protected timeoutTimers: any[];
    readonly onClose: Promise<void>;
    protected onCloseResolve?: Function;
    constructor(transportWriter: RpcConnectionWriter, connections: RpcKernelConnections);
    clientAddress(): string | undefined;
    createMessageBuilder(): RpcMessageBuilder;
    /**
     * Creates a regular timer using setTimeout() and automatically cancel it once the connection breaks or server stops.
     */
    setTimeout(cb: () => void, timeout: number): any;
    close(): void;
    feed(buffer: Uint8Array, bytes?: number): void;
    handleMessage(message: RpcMessage): void;
    abstract onMessage(message: RpcMessage, response: RpcMessageBuilder): void | Promise<void>;
    controller<T>(nameOrDefinition: string | ControllerDefinition<T>, timeoutInSeconds?: number): RemoteController<T>;
    sendMessage<T>(type: number, schema?: ClassSchema<T>, body?: T): RpcMessageSubject;
}
export declare class RpcKernelConnections {
    connections: RpcKernelBaseConnection[];
    broadcast(buffer: Uint8Array): void;
}
export declare class RpcKernelConnection extends RpcKernelBaseConnection {
    protected controllers: Map<string, {
        controller: ClassType;
        module?: InjectorModule;
    }>;
    protected security: RpcKernelSecurity;
    protected injector: InjectorContext;
    protected peerExchange: RpcPeerExchange;
    protected logger: LoggerInterface;
    myPeerId?: string;
    protected actionHandler: RpcServerAction;
    routeType: RpcMessageRouteType.client | RpcMessageRouteType.server;
    constructor(writer: RpcConnectionWriter, connections: RpcKernelConnections, controllers: Map<string, {
        controller: ClassType;
        module?: InjectorModule;
    }>, security: RpcKernelSecurity, injector: InjectorContext, peerExchange: RpcPeerExchange, logger?: LoggerInterface);
    onMessage(message: RpcMessage): Promise<void>;
    protected authenticate(message: RpcMessage, response: RpcMessageBuilder): Promise<void>;
    protected deregisterAsPeer(message: RpcMessage, response: RpcMessageBuilder): Promise<void>;
    protected registerAsPeer(message: RpcMessage, response: RpcMessageBuilder): Promise<void>;
}
export declare type OnConnectionCallback = (connection: RpcKernelConnection, injector: InjectorContext, logger: LoggerInterface) => void;
/**
 * The kernel is responsible for parsing the message header, redirecting to peer if necessary, loading the body parser,
 * and encode/send outgoing messages.
 */
export declare class RpcKernel {
    protected security: RpcKernelSecurity;
    protected logger: LoggerInterface;
    readonly controllers: Map<string, {
        controller: ClassType;
        module: InjectorModule;
    }>;
    protected peerExchange: RpcPeerExchange;
    protected connections: RpcKernelConnections;
    protected RpcKernelConnection: typeof RpcKernelConnection;
    protected onConnectionListeners: OnConnectionCallback[];
    protected autoInjector: boolean;
    injector: InjectorContext;
    constructor(injector?: InjectorContext, security?: RpcKernelSecurity, logger?: LoggerInterface);
    onConnection(callback: OnConnectionCallback): () => void;
    /**
     * This registers the controller and adds it as provider to the injector.
     *
     * If you created a kernel with custom injector, you probably want to set addAsProvider to false.
     * Adding a provider is rather expensive, so you should prefer to create a kernel with pre-filled  injector.
     */
    registerController(id: string | ControllerDefinition<any>, controller: ClassType, module?: InjectorModule): void;
    createConnection(writer: RpcConnectionWriter, injector?: InjectorContext): RpcKernelBaseConnection;
}
