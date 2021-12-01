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
exports.RpcWebSocketClientAdapter = exports.DeepkitClient = exports.RpcWebSocketClient = void 0;
const client_1 = require("./client");
/**
 * A RpcClient that connects via WebSocket transport.
 */
class RpcWebSocketClient extends client_1.RpcClient {
    constructor(url) {
        super(new RpcWebSocketClientAdapter(url));
    }
    static fromCurrentHost(baseUrl = '') {
        const ws = location.protocol.startsWith('https') ? 'wss' : 'ws';
        if (baseUrl.length && baseUrl[0] !== '/')
            baseUrl = '/' + baseUrl;
        return new this(`${ws}://${location.host}${baseUrl}`);
    }
}
exports.RpcWebSocketClient = RpcWebSocketClient;
/**
 * @deprecated use RpcWebSocketClient instead
 */
class DeepkitClient extends RpcWebSocketClient {
}
exports.DeepkitClient = DeepkitClient;
class RpcWebSocketClientAdapter {
    constructor(url) {
        this.url = url;
    }
    async connect(connection) {
        const wsPackage = 'ws';
        const webSocketConstructor = 'undefined' === typeof WebSocket && require ? require(wsPackage) : WebSocket;
        const socket = new webSocketConstructor(this.url);
        socket.binaryType = 'arraybuffer';
        socket.onmessage = (event) => {
            connection.onData(new Uint8Array(event.data));
        };
        socket.onclose = () => {
            connection.onClose();
        };
        socket.onerror = (error) => {
            connection.onError(error);
        };
        socket.onopen = async () => {
            connection.onConnected({
                clientAddress: () => {
                    return this.url;
                },
                bufferedAmount() {
                    return socket.bufferedAmount;
                },
                close() {
                    socket.close();
                },
                send(message) {
                    socket.send(message);
                }
            });
        };
    }
}
exports.RpcWebSocketClientAdapter = RpcWebSocketClientAdapter;
//# sourceMappingURL=client-websocket.js.map