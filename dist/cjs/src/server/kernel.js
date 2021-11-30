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
exports.RpcKernel = exports.RpcKernelConnection = exports.RpcKernelConnections = exports.RpcKernelBaseConnection = exports.RpcPeerExchange = exports.RpcMessageBuilder = exports.RpcCompositeMessage = void 0;
const core_1 = require("@deepkit/core");
const type_1 = require("@deepkit/type");
const message_subject_1 = require("../client/message-subject");
const model_1 = require("../model");
const protocol_1 = require("../protocol");
const writer_1 = require("../writer");
const action_1 = require("./action");
const security_1 = require("./security");
const action_2 = require("../client/action");
const injector_1 = require("@deepkit/injector");
const logger_1 = require("@deepkit/logger");
class RpcCompositeMessage {
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
        this.messages.push({ type, schema: schema ? type_1.getClassSchema(schema) : undefined, body });
        return this;
    }
    send() {
        if (this.clientId && this.source) {
            //we route back accordingly
            this.writer.write(protocol_1.createRpcCompositeMessageSourceDest(this.id, this.clientId, this.source, this.type, this.messages));
        }
        else {
            this.writer.write(protocol_1.createRpcCompositeMessage(this.id, this.type, this.messages, this.routeType));
        }
    }
}
exports.RpcCompositeMessage = RpcCompositeMessage;
class RpcMessageBuilder {
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
                return protocol_1.createRpcMessageSourceDestForBody(this.id, type, this.clientId, this.source, schemaOrBody);
            }
            else {
                return protocol_1.createRpcMessageForBody(this.id, type, schemaOrBody, this.routeType);
            }
        }
        else {
            if (this.source && this.clientId) {
                //we route back accordingly
                return protocol_1.createRpcMessageSourceDest(this.id, type, this.clientId, this.source, schemaOrBody, data);
            }
            else {
                return protocol_1.createRpcMessage(this.id, type, schemaOrBody, data, this.routeType);
            }
        }
    }
    ack() {
        this.writer.write(this.messageFactory(model_1.RpcTypes.Ack));
    }
    error(error) {
        const extracted = protocol_1.rpcEncodeError(error);
        this.writer.write(this.messageFactory(model_1.RpcTypes.Error, model_1.rpcError, extracted));
    }
    reply(type, schemaOrBody, body) {
        this.writer.write(this.messageFactory(type, schemaOrBody, body));
    }
    composite(type) {
        return new RpcCompositeMessage(type, this.id, this.writer, this.clientId, this.source);
    }
}
exports.RpcMessageBuilder = RpcMessageBuilder;
/**
 * This is a reference implementation and only works in a single process.
 * A real-life implementation would use an external message-bus, like Redis & co.
 */
class RpcPeerExchange {
    constructor() {
        this.registeredPeers = new Map();
    }
    async isRegistered(id) {
        return this.registeredPeers.has(id);
    }
    async deregister(id) {
        this.registeredPeers.delete('string' === typeof id ? id : type_1.stringifyUuid(id));
    }
    register(id, writer) {
        this.registeredPeers.set('string' === typeof id ? id : type_1.stringifyUuid(id), writer);
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
            const uuid = type_1.stringifyUuid(destination);
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
exports.RpcPeerExchange = RpcPeerExchange;
class RpcKernelBaseConnection {
    constructor(transportWriter, connections) {
        this.transportWriter = transportWriter;
        this.connections = connections;
        this.messageId = 0;
        this.sessionState = new security_1.SessionState();
        this.reader = new protocol_1.RpcMessageReader(this.handleMessage.bind(this), (id) => {
            this.writer.write(protocol_1.createRpcMessage(id, model_1.RpcTypes.ChunkAck));
        });
        this.actionClient = new action_2.RpcActionClient(this);
        this.id = type_1.writeUuid(protocol_1.createBuffer(16));
        this.replies = new Map();
        this.writerOptions = new writer_1.RpcMessageWriterOptions;
        this.writer = new writer_1.RpcMessageWriter(this.transportWriter, this.reader, this.writerOptions);
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
            core_1.arrayRemoveItem(this.timeoutTimers, timer);
        }, timeout);
        this.timeoutTimers.push(timer);
        return timer;
    }
    close() {
        for (const timeout of this.timeoutTimers)
            clearTimeout(timeout);
        if (this.onCloseResolve)
            this.onCloseResolve();
        core_1.arrayRemoveItem(this.connections.connections, this);
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
        const controller = new action_2.RpcControllerState('string' === typeof nameOrDefinition ? nameOrDefinition : nameOrDefinition.path);
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
            const message = protocol_1.createRpcMessage(id, type, schema, body, 1 /* server */);
            this.writer.write(message);
        };
        const subject = new message_subject_1.RpcMessageSubject(continuation, () => {
            this.replies.delete(id);
        });
        this.replies.set(id, (v) => subject.next(v));
        const message = protocol_1.createRpcMessage(id, type, schema, body, 1 /* server */);
        this.writer.write(message);
        return subject;
    }
}
exports.RpcKernelBaseConnection = RpcKernelBaseConnection;
class RpcKernelConnections {
    constructor() {
        this.connections = [];
    }
    broadcast(buffer) {
        for (const connection of this.connections) {
            connection.writer.write(buffer);
        }
    }
}
exports.RpcKernelConnections = RpcKernelConnections;
class RpcKernelConnection extends RpcKernelBaseConnection {
    constructor(writer, connections, controllers, security = new security_1.RpcKernelSecurity(), injector, peerExchange, logger = new logger_1.Logger()) {
        super(writer, connections);
        this.controllers = controllers;
        this.security = security;
        this.injector = injector;
        this.peerExchange = peerExchange;
        this.logger = logger;
        this.actionHandler = new action_1.RpcServerAction(this.controllers, this.injector, this.security, this.sessionState);
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
        if (message.type === model_1.RpcTypes.Ping) {
            this.writer.write(protocol_1.createRpcMessage(message.id, model_1.RpcTypes.Pong));
            return;
        }
        //all outgoing replies need to be routed to the source via sourceDest messages.
        const response = new RpcMessageBuilder(this.writer, message.id, this.id, message.routeType === 3 /* peer */ ? message.getSource() : undefined);
        response.routeType = this.routeType;
        try {
            if (message.routeType === 0 /* client */) {
                switch (message.type) {
                    case model_1.RpcTypes.ClientId:
                        return response.reply(model_1.RpcTypes.ClientIdResponse, model_1.rpcClientId, { id: this.id });
                    case model_1.RpcTypes.PeerRegister:
                        return await this.registerAsPeer(message, response);
                    case model_1.RpcTypes.PeerDeregister:
                        return this.deregisterAsPeer(message, response);
                }
            }
            switch (message.type) {
                case model_1.RpcTypes.Authenticate:
                    return await this.authenticate(message, response);
                case model_1.RpcTypes.ActionType:
                    return await this.actionHandler.handleActionTypes(message, response);
                case model_1.RpcTypes.Action:
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
        const body = message.parseBody(model_1.rpcAuthenticate);
        try {
            const session = await this.security.authenticate(body.token);
            this.sessionState.setSession(session);
            response.reply(model_1.RpcTypes.AuthenticateResponse, model_1.rpcResponseAuthenticate, { username: session.username });
        }
        catch (error) {
            if (error instanceof model_1.AuthenticationError)
                throw new Error(error.message);
            this.logger.error('authenticate failed', error);
            throw new model_1.AuthenticationError();
        }
    }
    async deregisterAsPeer(message, response) {
        const body = message.parseBody(model_1.rpcPeerRegister);
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
        const body = message.parseBody(model_1.rpcPeerRegister);
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
exports.RpcKernelConnection = RpcKernelConnection;
/**
 * The kernel is responsible for parsing the message header, redirecting to peer if necessary, loading the body parser,
 * and encode/send outgoing messages.
 */
class RpcKernel {
    constructor(injector, security = new security_1.RpcKernelSecurity(), logger = new logger_1.Logger()) {
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
            this.injector = injector_1.InjectorContext.forProviders([
                security_1.SessionState,
                //will be provided when scope is created
                { provide: RpcKernelConnection, scope: 'rpc', useValue: undefined },
            ]);
            this.autoInjector = true;
        }
    }
    onConnection(callback) {
        this.onConnectionListeners.push(callback);
        return () => {
            core_1.arrayRemoveItem(this.onConnectionListeners, callback);
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
exports.RpcKernel = RpcKernel;
//# sourceMappingURL=kernel.js.map