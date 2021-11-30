/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { RpcClient } from './client';
export class DirectClient extends RpcClient {
    constructor(rpcKernel, injector) {
        super(new RpcDirectClientAdapter(rpcKernel, injector));
    }
}
export class RpcDirectClientAdapter {
    constructor(rpcKernel, injector) {
        this.rpcKernel = rpcKernel;
        this.injector = injector;
    }
    async connect(connection) {
        const kernelConnection = this.rpcKernel.createConnection({
            write: (buffer) => connection.onData(buffer),
            close: () => { connection.onClose(); },
        }, this.injector);
        connection.onConnected({
            clientAddress: () => {
                return 'direct';
            },
            bufferedAmount() {
                return 0;
            },
            close() {
                kernelConnection.close();
            },
            send(buffer) {
                kernelConnection.feed(buffer);
            }
        });
    }
}
/**
 * This direct client includes in each outgoing/incoming message an async hop making
 * the communication asynchronous.
 */
export class AsyncDirectClient extends RpcClient {
    constructor(rpcKernel, injector) {
        super(new RpcAsyncDirectClientAdapter(rpcKernel, injector));
    }
}
export class RpcAsyncDirectClientAdapter {
    constructor(rpcKernel, injector) {
        this.rpcKernel = rpcKernel;
        this.injector = injector;
    }
    async connect(connection) {
        const kernelConnection = this.rpcKernel.createConnection({
            write: (buffer) => {
                setTimeout(() => {
                    connection.onData(buffer);
                });
            },
            close: () => { connection.onClose(); },
        }, this.injector);
        connection.onConnected({
            clientAddress: () => {
                return 'direct';
            },
            bufferedAmount() {
                return 0;
            },
            close() {
                kernelConnection.close();
            },
            send(buffer) {
                setTimeout(() => {
                    kernelConnection.feed(buffer);
                });
            }
        });
    }
}
//# sourceMappingURL=client-direct.js.map