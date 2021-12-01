"use strict";
/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcAsyncDirectClientAdapter = exports.AsyncDirectClient = exports.RpcDirectClientAdapter = exports.DirectClient = void 0;
const client_1 = require("./client");
class DirectClient extends client_1.RpcClient {
    constructor(rpcKernel, injector) {
        super(new RpcDirectClientAdapter(rpcKernel, injector));
    }
}
exports.DirectClient = DirectClient;
class RpcDirectClientAdapter {
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
exports.RpcDirectClientAdapter = RpcDirectClientAdapter;
/**
 * This direct client includes in each outgoing/incoming message an async hop making
 * the communication asynchronous.
 */
class AsyncDirectClient extends client_1.RpcClient {
    constructor(rpcKernel, injector) {
        super(new RpcAsyncDirectClientAdapter(rpcKernel, injector));
    }
}
exports.AsyncDirectClient = AsyncDirectClient;
class RpcAsyncDirectClientAdapter {
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
exports.RpcAsyncDirectClientAdapter = RpcAsyncDirectClientAdapter;
//# sourceMappingURL=client-direct.js.map