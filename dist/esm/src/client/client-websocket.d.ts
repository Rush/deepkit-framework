import { ClassType } from '@deepkit/core';
import { ClientTransportAdapter, RpcClient, TransportConnectionHooks } from './client';
/**
 * A RpcClient that connects via WebSocket transport.
 */
export declare class RpcWebSocketClient extends RpcClient {
    constructor(url: string);
    static fromCurrentHost<T extends ClassType<RpcClient>>(this: T, baseUrl?: string): InstanceType<T>;
}
/**
 * @deprecated use RpcWebSocketClient instead
 */
export declare class DeepkitClient extends RpcWebSocketClient {
}
export declare class RpcWebSocketClientAdapter implements ClientTransportAdapter {
    url: string;
    constructor(url: string);
    connect(connection: TransportConnectionHooks): Promise<void>;
}
