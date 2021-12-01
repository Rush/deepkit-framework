/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { arrayRemoveItem } from '@deepkit/core';
import { getClassSchema, stringifyUuid, writeUuid } from '@deepkit/type';
import { RpcMessageSubject } from '../client/message-subject';
import { AuthenticationError, rpcAuthenticate, rpcClientId, rpcError, rpcPeerRegister, rpcResponseAuthenticate, RpcTypes } from '../model';
import { createBuffer, createRpcCompositeMessage, createRpcCompositeMessageSourceDest, createRpcMessage, createRpcMessageForBody, createRpcMessageSourceDest, createRpcMessageSourceDestForBody, rpcEncodeError, RpcMessageReader } from '../protocol';
import { RpcMessageWriter, RpcMessageWriterOptions } from '../writer';
import { RpcServerAction } from './action';
import { RpcKernelSecurity, SessionState } from './security';
import { RpcActionClient, RpcControllerState } from '../client/action';
import { InjectorContext } from '@deepkit/injector';
import { Logger } from '@deepkit/logger';
export class RpcCompositeMessage {
    constructor(type, id, writer, clientId, source, routeType = 0 /* client */) {
        this.type = type;
        this.id = id;
        this.writer = writer;
        this.clientId = clientId;
        this.source = source;
        this.routeType = routeType;
        this.messages = [];
    }
    add(type, schema, body) {
        this.messages.push({ type, schema: schema ? getClassSchema(schema) : undefined, body });
        return this;
    }
    send() {
        if (this.clientId && this.source) {
            //we route back accordingly
            this.writer.write(createRpcCompositeMessageSourceDest(this.id, this.clientId, this.source, this.type, this.messages));
        }
        else {
            this.writer.write(createRpcCompositeMessage(this.id, this.type, this.messages, this.routeType));
        }
    }
}
export class RpcMessageBuilder {
    constructor(writer, id, clientId, source) {
        this.writer = writer;
        this.id = id;
        this.clientId = clientId;
        this.source = source;
        this.routeType = 0 /* client */;
    }
    messageFactory(type, schemaOrBody, data) {
        if (schemaOrBody instanceof Uint8Array) {
            if (this.source && this.clientId) {
                //we route back accordingly
                return createRpcMessageSourceDestForBody(this.id, type, this.clientId, this.source, schemaOrBody);
            }
            else {
                return createRpcMessageForBody(this.id, type, schemaOrBody, this.routeType);
            }
        }
        else {
            if (this.source && this.clientId) {
                //we route back accordingly
                return createRpcMessageSourceDest(this.id, type, this.clientId, this.source, schemaOrBody, data);
            }
            else {
                return createRpcMessage(this.id, type, schemaOrBody, data, this.routeType);
            }
        }
    }
    ack() {
        this.writer.write(this.messageFactory(RpcTypes.Ack));
    }
    error(error) {
        const extracted = rpcEncodeError(error);
        this.writer.write(this.messageFactory(RpcTypes.Error, rpcError, extracted));
    }
    reply(type, schemaOrBody, body) {
        this.writer.write(this.messageFactory(type, schemaOrBody, body));
    }
    composite(type) {
        return new RpcCompositeMessage(type, this.id, this.writer, this.clientId, this.source);
    }
}
/**
 * This is a reference implementation and only works in a single process.
 * A real-life implementation would use an external message-bus, like Redis & co.
 */
export class RpcPeerExchange {
    constructor() {
        this.registeredPeers = new Map();
    }
    async isRegistered(id) {
        return this.registeredPeers.has(id);
    }
    async deregister(id) {
        this.registeredPeers.delete('string' === typeof id ? id : stringifyUuid(id));
    }
    register(id, writer) {
        this.registeredPeers.set('string' === typeof id ? id : stringifyUuid(id), writer);
    }
    redirect(message) {
        if (message.routeType == 3 /* peer */) {
            const peerId = message.getPeerId();
            const writer = this.registeredPeers.get(peerId);
            if (!writer) {
                //we silently ignore, as a pub/sub would do as well
                console.log('NO writer found for peer', peerId);
                return;
            }
            writer.write(message.getBuffer());
        }
        if (message.routeType == 2 /* sourceDest */) {
            const destination = message.getDestination();
            //in this implementation we have to stringify it first, since v8 can not index Uint8Arrays
            const uuid = stringifyUuid(destination);
            const writer = this.registeredPeers.get(uuid);
            if (!writer) {
                console.log('NO writer found for destination', uuid);
                //we silently ignore, as a pub/sub would do as well
                return;
            }
            writer.write(message.getBuffer());
        }
    }
}
export class RpcKernelBaseConnection {
    constructor(transportWriter, connections) {
        this.transportWriter = transportWriter;
        this.connections = connections;
        this.messageId = 0;
        this.sessionState = new SessionState();
        this.reader = new RpcMessageReader(this.handleMessage.bind(this), (id) => {
            this.writer.write(createRpcMessage(id, RpcTypes.ChunkAck));
        });
        this.actionClient = new RpcActionClient(this);
        this.id = writeUuid(createBuffer(16));
        this.replies = new Map();
        this.writerOptions = new RpcMessageWriterOptions;
        this.writer = new RpcMessageWriter(this.transportWriter, this.reader, this.writerOptions);
        this.timeoutTimers = [];
        this.connections.connections.push(this);
        this.onClose = new Promise((resolve) => {
            this.onCloseResolve = resolve;
        });
    }
    clientAddress() {
        return this.transportWriter.clientAddress ? this.transportWriter.clientAddress() : undefined;
    }
    createMessageBuilder() {
        return new RpcMessageBuilder(this.writer, this.messageId++);
    }
    /**
     * Creates a regular timer using setTimeout() and automatically cancel it once the connection breaks or server stops.
     */
    setTimeout(cb, timeout) {
        const timer = setTimeout(() => {
            cb();
            arrayRemoveItem(this.timeoutTimers, timer);
        }, timeout);
        this.timeoutTimers.push(timer);
        return timer;
    }
    close() {
        for (const timeout of this.timeoutTimers)
            clearTimeout(timeout);
        if (this.onCloseResolve)
            this.onCloseResolve();
        arrayRemoveItem(this.connections.connections, this);
        this.writer.close();
    }
    feed(buffer, bytes) {
        this.reader.feed(buffer, bytes);
    }
    handleMessage(message) {
        if (message.routeType === 1 /* server */) {
            //initiated by the server, so we check replies
            const callback = this.replies.get(message.id);
            if (callback) {
                callback(message);
                return;
            }
        }
        const response = new RpcMessageBuilder(this.writer, message.id);
        this.onMessage(message, response);
    }
    controller(nameOrDefinition, timeoutInSeconds = 60) {
        const controller = new RpcControllerState('string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path);
        return new Proxy(this, {
            get: (target, propertyName) => {
                return (...args) => {
                    return this.actionClient.action(controller, propertyName, args);
                };
            }
        });
    }
    sendMessage(type, schema, body) {
        const id = this.messageId++;
        const continuation = (type, schema, body) => {
            //send a message with the same id. Don't use sendMessage() again as this would lead to a memory leak
            // and a new id generated. We want to use the same id.
            const message = createRpcMessage(id, type, schema, body, 1 /* server */);
            this.writer.write(message);
        };
        const subject = new RpcMessageSubject(continuation, () => {
            this.replies.delete(id);
        });
        this.replies.set(id, (v) => subject.next(v));
        const message = createRpcMessage(id, type, schema, body, 1 /* server */);
        this.writer.write(message);
        return subject;
    }
}
export class RpcKernelConnections {
    constructor() {
        this.connections = [];
    }
    broadcast(buffer) {
        for (const connection of this.connections) {
            connection.writer.write(buffer);
        }
    }
}
export class RpcKernelConnection extends RpcKernelBaseConnection {
    constructor(writer, connections, controllers, security = new RpcKernelSecurity(), injector, peerExchange, logger = new Logger()) {
        super(writer, connections);
        this.controllers = controllers;
        this.security = security;
        this.injector = injector;
        this.peerExchange = peerExchange;
        this.logger = logger;
        this.actionHandler = new RpcServerAction(this.controllers, this.injector, this.security, this.sessionState);
        this.routeType = 0 /* client */;
        this.onClose.then(() => this.actionHandler.onClose());
        this.peerExchange.register(this.id, this.writer);
    }
    async onMessage(message) {
        if (message.routeType == 3 /* peer */ && message.getPeerId() !== this.myPeerId) {
            // console.log('Redirect peer message', RpcTypes[message.type]);
            if (!await this.security.isAllowedToSendToPeer(this.sessionState.getSession(), message.getPeerId())) {
                new RpcMessageBuilder(this.writer, message.id).error(new Error('Access denied'));
                return;
            }
            this.peerExchange.redirect(message);
            return;
        }
        if (message.routeType == 2 /* sourceDest */) {
            // console.log('Redirect sourceDest message', RpcTypes[message.type]);
            this.peerExchange.redirect(message);
            return;
        }
        if (message.type === RpcTypes.Ping) {
            this.writer.write(createRpcMessage(message.id, RpcTypes.Pong));
            return;
        }
        //all outgoing replies need to be routed to the source via sourceDest messages.
        const response = new RpcMessageBuilder(this.writer, message.id, this.id, message.routeType === 3 /* peer */ ? message.getSource() : undefined);
        response.routeType = this.routeType;
        try {
            if (message.routeType === 0 /* client */) {
                switch (message.type) {
                    case RpcTypes.ClientId:
                        return response.reply(RpcTypes.ClientIdResponse, rpcClientId, { id: this.id });
                    case RpcTypes.PeerRegister:
                        return await this.registerAsPeer(message, response);
                    case RpcTypes.PeerDeregister:
                        return this.deregisterAsPeer(message, response);
                }
            }
            switch (message.type) {
                case RpcTypes.Authenticate:
                    return await this.authenticate(message, response);
                case RpcTypes.ActionType:
                    return await this.actionHandler.handleActionTypes(message, response);
                case RpcTypes.Action:
                    return await this.actionHandler.handleAction(message, response);
                default:
                    return await this.actionHandler.handle(message, response);
            }
        }
        catch (error) {
            response.error(error);
        }
    }
    async authenticate(message, response) {
        const body = message.parseBody(rpcAuthenticate);
        try {
            const session = await this.security.authenticate(body.token);
            this.sessionState.setSession(session);
            response.reply(RpcTypes.AuthenticateResponse, rpcResponseAuthenticate, { username: session.username });
        }
        catch (error) {
            if (error instanceof AuthenticationError)
                throw new Error(error.message);
            this.logger.error('authenticate failed', error);
            throw new AuthenticationError();
        }
    }
    async deregisterAsPeer(message, response) {
        const body = message.parseBody(rpcPeerRegister);
        try {
            if (body.id !== this.myPeerId) {
                return response.error(new Error(`Not registered as that peer`));
            }
            this.myPeerId = undefined;
            await this.peerExchange.deregister(body.id);
            response.ack();
        }
        catch (error) {
            this.logger.error('deregisterAsPeer failed', error);
            response.error(new Error('Failed'));
        }
    }
    async registerAsPeer(message, response) {
        const body = message.parseBody(rpcPeerRegister);
        try {
            if (await this.peerExchange.isRegistered(body.id)) {
                return response.error(new Error(`Peer ${body.id} already registereed`));
            }
            if (!await this.security.isAllowedToRegisterAsPeer(this.sessionState.getSession(), body.id)) {
                response.error(new Error('Access denied'));
                return;
            }
            await this.peerExchange.register(body.id, this.writer);
            this.myPeerId = body.id;
            response.ack();
        }
        catch (error) {
            this.logger.error('registerAsPeer failed', error);
            response.error(new Error('Failed'));
        }
    }
}
/**
 * The kernel is responsible for parsing the message header, redirecting to peer if necessary, loading the body parser,
 * and encode/send outgoing messages.
 */
export class RpcKernel {
    constructor(injector, security = new RpcKernelSecurity(), logger = new Logger()) {
        this.security = security;
        this.logger = logger;
        this.controllers = new Map();
        this.peerExchange = new RpcPeerExchange;
        this.connections = new RpcKernelConnections;
        this.RpcKernelConnection = RpcKernelConnection;
        this.onConnectionListeners = [];
        this.autoInjector = false;
        if (injector) {
            this.injector = injector;
        }
        else {
            this.injector = InjectorContext.forProviders([
                SessionState,
                //will be provided when scope is created
                { provide: RpcKernelConnection, scope: 'rpc', useValue: undefined },
            ]);
            this.autoInjector = true;
        }
    }
    onConnection(callback) {
        this.onConnectionListeners.push(callback);
        return () => {
            arrayRemoveItem(this.onConnectionListeners, callback);
        };
    }
    /**
     * This registers the controller and adds it as provider to the injector.
     *
     * If you created a kernel with custom injector, you probably want to set addAsProvider to false.
     * Adding a provider is rather expensive, so you should prefer to create a kernel with pre-filled  injector.
     */
    registerController(id, controller, module) {
        if (this.autoInjector) {
            if (!this.injector.rootModule.isProvided(controller)) {
                this.injector.rootModule.addProvider({ provide: controller, scope: 'rpc' });
            }
        }
        this.controllers.set('string' === typeof id ? id : id.path, { controller, module: module || this.injector.rootModule });
    }
    createConnection(writer, injector) {
        if (!injector)
            injector = this.injector.createChildScope('rpc');
        const connection = new this.RpcKernelConnection(writer, this.connections, this.controllers, this.security, injector, this.peerExchange, this.logger);
        injector.set(RpcKernelConnection, connection);
        for (const on of this.onConnectionListeners)
            on(connection, injector, this.logger);
        return connection;
    }
}
//# sourceMappingURL=kernel.js.map