import { ClassSchema } from '@deepkit/type';
import type { SingleProgress } from './writer';
export declare const enum RpcMessageRouteType {
    client = 0,
    server = 1,
    sourceDest = 2,
    peer = 3
}
export declare class RpcMessage {
    id: number;
    composite: boolean;
    type: number;
    routeType: RpcMessageRouteType;
    bodyOffset: number;
    bodySize: number;
    buffer?: Uint8Array | undefined;
    protected peerId?: string;
    protected source?: string;
    protected destination?: string;
    constructor(id: number, composite: boolean, type: number, routeType: RpcMessageRouteType, bodyOffset: number, bodySize: number, buffer?: Uint8Array | undefined);
    debug(): {
        type: number;
        id: number;
        date: Date;
        composite: boolean;
        body: object | undefined;
        messages: {
            id: number;
            type: number;
            date: Date;
            body: object | undefined;
        }[];
    };
    getBuffer(): Uint8Array;
    getPeerId(): string;
    getSource(): Uint8Array;
    getDestination(): Uint8Array;
    getError(): Error;
    isError(): boolean;
    parseGenericBody(): object;
    parseBody<T>(schema: ClassSchema<T>): T;
    getBodies(): RpcMessage[];
}
export declare class ErroredRpcMessage extends RpcMessage {
    id: number;
    error: Error;
    constructor(id: number, error: Error);
    getError(): Error;
}
export declare function readRpcMessage(buffer: Uint8Array): RpcMessage;
export declare const createBuffer: (size: number) => Uint8Array;
export interface RpcCreateMessageDef<T> {
    type: number;
    schema?: ClassSchema<T>;
    body?: T;
}
export declare function createRpcCompositeMessage<T>(id: number, type: number, messages: RpcCreateMessageDef<any>[], routeType?: RpcMessageRouteType.client | RpcMessageRouteType.server): Uint8Array;
export declare function createRpcCompositeMessageSourceDest<T>(id: number, source: Uint8Array, destination: Uint8Array, type: number, messages: RpcCreateMessageDef<any>[]): Uint8Array;
export declare function createRpcMessage<T>(id: number, type: number, schema?: ClassSchema<T>, body?: T, routeType?: RpcMessageRouteType.client | RpcMessageRouteType.server): Uint8Array;
export declare function createRpcMessageForBody<T>(id: number, type: number, body: Uint8Array, routeType?: RpcMessageRouteType.client | RpcMessageRouteType.server): Uint8Array;
export declare function createRpcMessagePeer<T>(id: number, type: number, source: Uint8Array, peerId: string, schema?: ClassSchema<T>, body?: T): Uint8Array;
export declare function createRpcMessageSourceDest<T>(id: number, type: number, source: Uint8Array, destination: Uint8Array, schema?: ClassSchema<T>, body?: T): Uint8Array;
export declare function createRpcMessageSourceDestForBody<T>(id: number, type: number, source: Uint8Array, destination: Uint8Array, body: Uint8Array): Uint8Array;
export declare class RpcMessageReader {
    protected readonly onMessage: (response: RpcMessage) => void;
    protected readonly onChunk?: ((id: number) => void) | undefined;
    protected chunks: Map<number, {
        loaded: number;
        buffers: Uint8Array[];
    }>;
    protected progress: Map<number, SingleProgress>;
    protected chunkAcks: Map<number, Function>;
    protected bufferReader: RpcBufferReader;
    constructor(onMessage: (response: RpcMessage) => void, onChunk?: ((id: number) => void) | undefined);
    onChunkAck(id: number, callback: Function): void;
    registerProgress(id: number, progress: SingleProgress): void;
    feed(buffer: Uint8Array, bytes?: number): void;
    protected gotMessage(buffer: Uint8Array): void;
}
export declare function readUint32LE(buffer: Uint8Array, offset?: number): number;
export declare class RpcBufferReader {
    protected readonly onMessage: (response: Uint8Array) => void;
    protected currentMessage?: Uint8Array;
    protected currentMessageSize: number;
    constructor(onMessage: (response: Uint8Array) => void);
    emptyBuffer(): boolean;
    feed(data: Uint8Array, bytes?: number): void;
}
export interface EncodedError {
    classType: string;
    message: string;
    stack: string;
    properties?: {
        [name: string]: any;
    };
}
export declare function rpcEncodeError(error: Error | string): EncodedError;
export declare function rpcDecodeError(error: EncodedError): Error;
