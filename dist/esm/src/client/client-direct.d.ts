import { RpcKernel } from '../server/kernel';
import { ClientTransportAdapter, RpcClient, TransportConnectionHooks } from './client';
import { InjectorContext } from '@deepkit/injector';
export declare class DirectClient extends RpcClient {
    constructor(rpcKernel: RpcKernel, injector?: InjectorContext);
}
export declare class RpcDirectClientAdapter implements ClientTransportAdapter {
    rpcKernel: RpcKernel;
    protected injector?: InjectorContext | undefined;
    constructor(rpcKernel: RpcKernel, injector?: InjectorContext | undefined);
    connect(connection: TransportConnectionHooks): Promise<void>;
}
/**
 * This direct client includes in each outgoing/incoming message an async hop making
 * the communication asynchronous.
 */
export declare class AsyncDirectClient extends RpcClient {
    constructor(rpcKernel: RpcKernel, injector?: InjectorContext);
}
export declare class RpcAsyncDirectClientAdapter implements ClientTransportAdapter {
    rpcKernel: RpcKernel;
    protected injector?: InjectorContext | undefined;
    constructor(rpcKernel: RpcKernel, injector?: InjectorContext | undefined);
    connect(connection: TransportConnectionHooks): Promise<void>;
}
