/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ConnectionWriter, RpcConnectionWriter, RpcKernel, RpcKernelBaseConnection, RpcKernelConnection, RpcKernelSecurity, SessionState } from '@deepkit/rpc';
import http, { Server } from 'http';
import https from 'https';

import type { Server as WebSocketServer, ServerOptions as WebSocketServerOptions } from 'ws';

import { HttpKernel, HttpRequest, HttpResponse } from '@deepkit/http';
import { inject, injectable, Injector, InjectorContext, Provider } from '@deepkit/injector';
import { RpcInjectorContext, RpcKernelWithStopwatch } from './rpc';
import { RpcControllers } from './application-service-container';
import { SecureContextOptions, TlsOptions } from 'tls';

// @ts-ignore
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Logger } from '@deepkit/logger';
import { ClassType } from '@deepkit/core';
import { Stopwatch } from '@deepkit/stopwatch';

export interface WebServerOptions {
    host: string;

    /**
     * Defins the port of the http server.
     * If ssl is defined, this port is used for the https server. If you want to have http and https
     * at the same time, use `httpsPort` accordingly.
    */
    port: number;

    varPath: string;

    /**
     * If httpsPort and ssl is defined, then the https server is started additional to the http-server.
     *
     * In a production deployment, you usually want both, http and https server.
     * Set `port: 80` and `httpsPort: 443` to have both.
     */
    httpsPort?: number;

    /**
     * HTTP Keep alive timeout.
     */
    keepAliveTimeout?: number;

    /**
     * When external server should be used. If this is set, all other options are ignored.
     */
    server?: Server;

    /**
     * Enables HTTPS.
     * Make sure to pass `sslKey` and `sslCertificate` as well (or use sslOptions).
    */
    ssl: boolean;

    sslKey?: string;
    sslCertificate?: string;
    sslCa?: string;
    sslCrl?: string;

    /**
     * If defined https.createServer is used and all options passed as is to it.
     * Make sure to pass `key` and `cert`, as described in Node's https.createServer() documentation.
     * See https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener
     */
    sslOptions?: SecureContextOptions & TlsOptions;

    /**
     * When true keys & certificates are created on-the-fly (for development purposes).
     * Should not be used in production.
     */
    selfSigned?: boolean;
}


export interface RpcServerListener {
    close(): void | Promise<void>;
}

export interface RpcServerCreateConnection {
    (writer: RpcConnectionWriter, request?: HttpRequest): RpcKernelBaseConnection;
}

export interface RpcServerOptions {
    server?: http.Server | https.Server;
}

export interface RpcServerInterface {
    start(options: RpcServerOptions, createRpcConnection: RpcServerCreateConnection): void;
}

@injectable()
export class RpcServer implements RpcServerInterface {
    start(options: RpcServerOptions, createRpcConnection: RpcServerCreateConnection): RpcServerListener {
        const ws = require('ws');
        const { Server }: { Server: { new(options: WebSocketServerOptions): WebSocketServer } } = ws;

        const server = new Server(options);

        server.on('connection', (ws, req: HttpRequest) => {
            const connection = createRpcConnection({
                write(b) {
                    ws.send(b);
                },
                close() {
                    ws.close();
                },
                bufferedAmount(): number {
                    return ws.bufferedAmount;
                },
                clientAddress(): string {
                    return req.getRemoteAddress();
                }
            }, req);

            ws.on('message', async (message: Uint8Array) => {
                connection.feed(message);
            });

            ws.on('close', async () => {
                connection.close();
            });
        });

        return {
            close() {
                server.close();
            }
        };
    }
}


@injectable()
export class WebWorkerFactory {
    constructor(
        protected httpKernel: HttpKernel,
        public logger: Logger,
        protected rpcControllers: RpcControllers,
        protected rootScopedContext: InjectorContext,
        protected rpcServer: RpcServer,
        @inject().optional protected stopwatch?: Stopwatch,
    ) {
    }

    create(id: number, options: WebServerOptions): WebWorker {
        return new WebWorker(id, this.logger, this.httpKernel, this.createRpcKernel(), this.rootScopedContext, options, this.rpcServer);
    }

    createRpcKernel() {
        const security = this.rootScopedContext.get(RpcKernelSecurity);
        const classType = this.stopwatch ? RpcKernelWithStopwatch : RpcKernel;
        const kernel = new classType(this.rootScopedContext, security, this.logger.scoped('rpc'));

        if (kernel instanceof RpcKernelWithStopwatch) {
            kernel.stopwatch = this.stopwatch;
        }

        for (const [name, info] of this.rpcControllers.controllers.entries()) {
            kernel.registerController(name, info.controller, false, info.context.id);
        }

        return kernel;
    }
}

export class WebMemoryWorkerFactory extends WebWorkerFactory {
    create(id: number, options: WebServerOptions): WebMemoryWorker {
        return new WebMemoryWorker(id, this.logger, this.httpKernel, this.createRpcKernel(), this.rootScopedContext, options, this.rpcServer);
    }
}

export function createRpcConnection(rootScopedContext: InjectorContext, rpcKernel: RpcKernel, writer: RpcConnectionWriter, request?: HttpRequest) {
    let rpcScopedContext: RpcInjectorContext;
    let connection: RpcKernelBaseConnection;

    const providers: Provider<any>[] = [
        { provide: HttpRequest, useValue: request },
        { provide: RpcInjectorContext, useFactory: () => rpcScopedContext },
        { provide: SessionState, useFactory: () => connection.sessionState },
        { provide: RpcKernelConnection, useFactory: () => connection },
        { provide: RpcKernelBaseConnection as ClassType<any>, useFactory: () => connection },
        { provide: ConnectionWriter, useValue: writer },
    ];
    const additionalInjector = new Injector(providers);
    rpcScopedContext = rootScopedContext.createChildScope('rpc', additionalInjector);

    connection = rpcKernel.createConnection(writer, rpcScopedContext);
    return connection;
}

@injectable()
export class WebWorker {
    protected rpcListener?: RpcServerListener;
    protected server?: http.Server | https.Server;
    protected servers?: https.Server;

    constructor(
        public readonly id: number,
        public logger: Logger,
        public httpKernel: HttpKernel,
        public rpcKernel: RpcKernel,
        protected rootScopedContext: InjectorContext,
        protected options: WebServerOptions,
        private rpcServer: RpcServer,
    ) {
    }

    start() {
        if (this.options.server) {
            this.server = this.options.server as Server;
            this.server.on('request', this.httpKernel.handleRequest.bind(this.httpKernel));
        } else {
            if (this.options.ssl) {
                const options = this.options.sslOptions || {};

                if (this.options.selfSigned) {
                    const keyPath = join(this.options.varPath, `self-signed-${this.options.host}.key`);
                    const certificatePath = join(this.options.varPath, `self-signed-${this.options.host}.cert`);
                    if (existsSync(keyPath) && existsSync(certificatePath)) {
                        options.key = readFileSync(keyPath, 'utf8');
                        options.cert = readFileSync(certificatePath, 'utf8');
                    } else {
                        const selfsigned = require('selfsigned');
                        const attrs = [{ name: 'commonName', value: this.options.host }];
                        const pems = selfsigned.generate(attrs, { days: 365 });
                        options.cert = pems.cert;
                        options.key = pems.private;
                        writeFileSync(keyPath, pems.private, 'utf8');
                        writeFileSync(certificatePath, pems.cert, 'utf8');
                        this.logger.log(`Self signed certificate for ${this.options.host} created at ${certificatePath}`);
                        this.logger.log(`Tip: If you want to open this server via chrome for localhost, use chrome://flags/#allow-insecure-localhost`);
                    }
                }

                if (!options.key && this.options.sslKey) options.key = readFileSync(this.options.sslKey, 'utf8');
                if (!options.ca && this.options.sslCa) options.key = readFileSync(this.options.sslCa, 'utf8');
                if (!options.cert && this.options.sslCertificate) options.cert = readFileSync(this.options.sslCertificate, 'utf8');
                if (!options.crl && this.options.sslCrl) options.cert = readFileSync(this.options.sslCrl, 'utf8');

                this.servers = new https.Server(
                    Object.assign({ IncomingMessage: HttpRequest, ServerResponse: HttpResponse, }, options),
                    this.httpKernel.handleRequest.bind(this.httpKernel) as any //as any necessary since http.Server is not typed correctly
                );
                this.servers.listen(this.options.httpsPort || this.options.port, this.options.host);
                if (this.options.keepAliveTimeout) this.servers.keepAliveTimeout = this.options.keepAliveTimeout;

            }

            const startHttpServer = !this.servers || (this.servers && this.options.httpsPort);
            if (startHttpServer) {
                this.server = new http.Server(
                    { IncomingMessage: HttpRequest, ServerResponse: HttpResponse },
                    this.httpKernel.handleRequest.bind(this.httpKernel) as any //as any necessary since http.Server is not typed correctly
                );
                if (this.options.keepAliveTimeout) this.server.keepAliveTimeout = this.options.keepAliveTimeout;
                this.server.listen(this.options.port, this.options.host);
            }
        }
        this.startRpc();
    }

    private startRpc() {
        if (this.server) {
            this.rpcListener = this.rpcServer.start({ server: this.server }, (writer: RpcConnectionWriter, request?: HttpRequest) => {
                return createRpcConnection(this.rootScopedContext, this.rpcKernel, writer, request);
            });
        }
    }

    async close() {
        if (this.rpcListener) await this.rpcListener.close();
        if (this.server) this.server.close();
        if (this.servers) this.servers.close();
    }
}

export class WebMemoryWorker extends WebWorker {
    start() { }
}
