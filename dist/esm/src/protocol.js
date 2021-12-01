/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { deserialize, getBSONDecoder, getBSONSerializer, getBSONSizer, Writer } from '@deepkit/bson';
import { getClassSchema, getGlobalStore, jsonSerializer } from '@deepkit/type';
import { rpcChunk, rpcError, RpcTypes } from './model';
// export class RpcMessageRoute {
//     public peerId?: string;
//     public source?: string;
//     public destination?: string;
//     constructor(
//         public type: RpcMessageRouteType = 0,
//     ) {
//     }
// }
/*
 * A message is binary data and has the following structure:
 *
 * <size> <version> <id> <route>[<routeConfig>] <composite> <messageBody>
 *
 * size: uint32 //total message size
 * version: uint8
 * id: uint32 //message id
 *
 * //type of routing:
 * //0=client (context from client -> server), //client initiated a message context (message id created on client)
 * //1=server (context from server -> client), //server initiated a message context (message id created on server)
 * //2=sourceDest //route this message to a specific client using its client id
 * //4=peer //route this message to a client using a peer alias (the peer alias needs to be registered). replies will be rewritten to sourceDest
 *
 * //when route=0
 * routeConfig: not defined
 *
 * //when route=1
 * routeConfig: not defined
 *
 * //when route=2
 * routeConfig: <source><destination>, each 16 bytes, uuid v4
 *
 * //when route=3
 * routeConfig: <source><peerId> //where source=uuid v4, and peerId=ascii string (terminated by \0)
 *
 * composite: uint8 //when 1 then there are multiple messageBody, each prefixed with uint32 for their size
 *
 * composite=0 then messageBody=<type><body>:
 *   type: uint8 (256 types supported) //supported type
 *   body: BSON|any //arbitrary payload passed to type
 *
 * composite=1 then messageBody=<size><type><body>:
 *   size: uint32
 *   type: uint8 (256 types supported) //supported type
 *   body: BSON|any //arbitrary payload passed to type
 *
 */
export class RpcMessage {
    constructor(id, composite, type, routeType, bodyOffset, bodySize, buffer) {
        this.id = id;
        this.composite = composite;
        this.type = type;
        this.routeType = routeType;
        this.bodyOffset = bodyOffset;
        this.bodySize = bodySize;
        this.buffer = buffer;
    }
    debug() {
        return {
            type: this.type,
            id: this.id,
            date: new Date,
            composite: this.composite,
            body: this.bodySize ? this.parseGenericBody() : undefined,
            messages: this.composite ? this.getBodies().map(message => {
                return {
                    id: message.id, type: message.type, date: new Date, body: message.bodySize ? message.parseGenericBody() : undefined,
                };
            }) : [],
        };
    }
    getBuffer() {
        if (!this.buffer)
            throw new Error('No buffer');
        return this.buffer;
    }
    getPeerId() {
        if (!this.buffer)
            throw new Error('No buffer');
        if (this.routeType !== 3 /* peer */)
            throw new Error(`Message is not routed via peer, but ${this.routeType}`);
        if (this.peerId)
            return this.peerId;
        this.peerId = '';
        for (let offset = 10 + 16, c = this.buffer[offset]; c !== 0; offset++, c = this.buffer[offset]) {
            this.peerId += String.fromCharCode(c);
        }
        return this.peerId;
    }
    getSource() {
        if (!this.buffer)
            throw new Error('No buffer');
        if (this.routeType !== 2 /* sourceDest */ && this.routeType !== 3 /* peer */)
            throw new Error(`Message is not routed via sourceDest, but ${this.routeType}`);
        return this.buffer.slice(4 + 1 + 4 + 1, 4 + 1 + 4 + 1 + 16);
    }
    getDestination() {
        if (!this.buffer)
            throw new Error('No buffer');
        if (this.routeType !== 2 /* sourceDest */)
            throw new Error(`Message is not routed via sourceDest, but ${this.routeType}`);
        return this.buffer.slice(4 + 1 + 4 + 1 + 16, 4 + 1 + 4 + 1 + 16 + 16);
    }
    getError() {
        if (!this.buffer)
            throw new Error('No buffer');
        const error = getBSONDecoder(rpcError)(this.buffer, this.bodyOffset);
        return rpcDecodeError(error);
    }
    isError() {
        return this.type === RpcTypes.Error;
    }
    parseGenericBody() {
        if (!this.bodySize)
            throw new Error('Message has no body');
        if (!this.buffer)
            throw new Error('No buffer');
        if (this.composite)
            throw new Error('Composite message can not be read directly');
        return deserialize(this.buffer, this.bodyOffset);
    }
    parseBody(schema) {
        if (!this.bodySize)
            throw new Error('Message has no body');
        if (!this.buffer)
            throw new Error('No buffer');
        if (this.composite)
            throw new Error('Composite message can not be read directly');
        if (!schema.jit.bsonEncoder)
            getBSONDecoder(schema);
        return schema.jit.bsonEncoder(this.buffer, this.bodyOffset);
    }
    getBodies() {
        if (!this.composite)
            throw new Error('Not a composite message');
        const messages = [];
        const buffer = this.getBuffer();
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const totalSize = view.getUint32(0, true);
        let offset = this.bodyOffset;
        while (offset < totalSize) {
            const bodySize = view.getUint32(offset, true);
            offset += 4;
            const type = view.getUint8(offset++);
            messages.push(new RpcMessage(this.id, false, type, this.routeType, offset, bodySize, buffer));
            offset += bodySize;
        }
        return messages;
    }
}
export class ErroredRpcMessage extends RpcMessage {
    constructor(id, error) {
        super(id, false, RpcTypes.Error, 0, 0, 0);
        this.id = id;
        this.error = error;
    }
    getError() {
        return this.error;
    }
}
export function readRpcMessage(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const size = view.getUint32(0, true);
    if (size !== buffer.byteLength)
        throw new Error(`Message buffer size wrong. Message size=${size}, buffer size=${buffer.byteLength}`);
    const id = view.getUint32(5, true);
    let offset = 9;
    const routeType = buffer[offset++];
    if (routeType === 3 /* peer */) {
        offset += 16; //<source>
        while (buffer[offset++] !== 0)
            ; //feed until \0 byte
    }
    else if (routeType === 2 /* sourceDest */) {
        offset += 16 + 16; //uuid is each 16 bytes
    }
    const composite = buffer[offset++] === 1;
    const type = buffer[offset++];
    return new RpcMessage(id, composite, type, routeType, offset, size - offset, buffer);
}
export const createBuffer = 'undefined' !== typeof Buffer && 'function' === typeof Buffer.allocUnsafe ? Buffer.allocUnsafe : (size) => new Uint8Array(size);
export function createRpcCompositeMessage(id, type, messages, routeType = 0 /* client */) {
    let bodySize = 0;
    for (const message of messages) {
        bodySize += 4 + 1 + (message.schema && message.body ? getBSONSizer(message.schema)(message.body) : 0);
    }
    //<size> <version> <messageId> <routeType>[routeData] <isComposite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + 1 + 1 + bodySize;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(routeType);
    writer.writeByte(1);
    writer.writeByte(type);
    for (const message of messages) {
        writer.writeUint32(message.schema && message.body ? getBSONSizer(message.schema)(message.body) : 0);
        writer.writeByte(message.type); //type
        if (message.schema && message.body) {
            //BSON object contain already their size at the beginning
            getBSONSerializer(message.schema)(message.body, writer);
        }
    }
    return writer.buffer;
}
export function createRpcCompositeMessageSourceDest(id, source, destination, type, messages) {
    let bodySize = 0;
    for (const message of messages) {
        bodySize += 4 + 1 + (message.schema && message.body ? getBSONSizer(message.schema)(message.body) : 0);
    }
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + 16) + 1 + 1 + bodySize;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(2 /* sourceDest */);
    if (source.byteLength !== 16)
        throw new Error(`Source invalid byteLength of ${source.byteLength}`);
    if (destination.byteLength !== 16)
        throw new Error(`Destination invalid byteLength of ${destination.byteLength}`);
    writer.writeBuffer(source);
    writer.writeBuffer(destination);
    writer.writeByte(1); //composite=true
    writer.writeByte(type);
    for (const message of messages) {
        writer.writeUint32(message.schema && message.body ? getBSONSizer(message.schema)(message.body) : 0);
        writer.writeByte(message.type); //type
        if (message.schema && message.body) {
            //BSON object contain already their size at the beginning
            getBSONSerializer(message.schema)(message.body, writer);
        }
    }
    return writer.buffer;
}
export function createRpcMessage(id, type, schema, body, routeType = 0 /* client */) {
    if (schema) {
        if (!schema.jit.bsonSizer)
            getBSONSizer(schema);
        if (!schema.jit.bsonSerializer)
            getBSONSerializer(schema);
    }
    const bodySize = schema && body ? schema.jit.bsonSizer(body) : 0;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + 1 + 1 + bodySize;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(routeType);
    writer.writeByte(0); //composite=false
    writer.writeByte(type);
    if (schema && body)
        schema.jit.bsonSerializer(body, writer);
    return writer.buffer;
}
export function createRpcMessageForBody(id, type, body, routeType = 0 /* client */) {
    const bodySize = body.byteLength;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + 1 + 1 + bodySize;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(routeType);
    writer.writeByte(0); //composite=false
    writer.writeByte(type);
    writer.writeBuffer(body);
    return writer.buffer;
}
export function createRpcMessagePeer(id, type, source, peerId, schema, body) {
    const bodySize = schema && body ? getBSONSizer(schema)(body) : 0;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + peerId.length + 1) + 1 + 1 + bodySize;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(3 /* peer */);
    if (source.byteLength !== 16)
        throw new Error(`Source invalid byteLength of ${source.byteLength}`);
    writer.writeBuffer(source);
    writer.writeAsciiString(peerId);
    writer.writeNull();
    writer.writeByte(0); //composite=false
    writer.writeByte(type);
    if (schema && body)
        getBSONSerializer(schema)(body, writer);
    return writer.buffer;
}
export function createRpcMessageSourceDest(id, type, source, destination, schema, body) {
    const bodySize = schema && body ? getBSONSizer(schema)(body) : 0;
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + 16) + 1 + 1 + bodySize;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(2 /* sourceDest */);
    if (source.byteLength !== 16)
        throw new Error(`Source invalid byteLength of ${source.byteLength}`);
    if (destination.byteLength !== 16)
        throw new Error(`Destination invalid byteLength of ${destination.byteLength}`);
    writer.writeBuffer(source);
    writer.writeBuffer(destination);
    writer.writeByte(0); //composite=false
    writer.writeByte(type);
    if (schema && body)
        getBSONSerializer(schema)(body, writer);
    return writer.buffer;
}
export function createRpcMessageSourceDestForBody(id, type, source, destination, body) {
    //<size> <version> <messageId> <routeType>[routeData] <composite> <type> <body...>
    const messageSize = 4 + 1 + 4 + 1 + (16 + 16) + 1 + 1 + body.byteLength;
    const writer = new Writer(createBuffer(messageSize));
    writer.writeUint32(messageSize);
    writer.writeByte(1); //version
    writer.writeUint32(id);
    writer.writeByte(2 /* sourceDest */);
    if (source.byteLength !== 16)
        throw new Error(`Source invalid byteLength of ${source.byteLength}`);
    if (destination.byteLength !== 16)
        throw new Error(`Destination invalid byteLength of ${destination.byteLength}`);
    writer.writeBuffer(source);
    writer.writeBuffer(destination);
    writer.writeByte(0); //composite=false
    writer.writeByte(type);
    writer.writeBuffer(body);
    return writer.buffer;
}
export class RpcMessageReader {
    constructor(onMessage, onChunk) {
        this.onMessage = onMessage;
        this.onChunk = onChunk;
        this.chunks = new Map();
        this.progress = new Map();
        this.chunkAcks = new Map();
        this.bufferReader = new RpcBufferReader(this.gotMessage.bind(this));
    }
    onChunkAck(id, callback) {
        this.chunkAcks.set(id, callback);
    }
    registerProgress(id, progress) {
        this.progress.set(id, progress);
    }
    feed(buffer, bytes) {
        this.bufferReader.feed(buffer, bytes);
    }
    gotMessage(buffer) {
        const message = readRpcMessage(buffer);
        // console.log('reader got', message.id, RpcTypes[message.type], message.bodySize, buffer.byteLength);
        if (message.type === RpcTypes.ChunkAck) {
            const ack = this.chunkAcks.get(message.id);
            if (ack)
                ack();
        }
        else if (message.type === RpcTypes.Chunk) {
            const progress = this.progress.get(message.id);
            const body = message.parseBody(rpcChunk);
            let chunks = this.chunks.get(body.id);
            if (!chunks) {
                chunks = { buffers: [], loaded: 0 };
                this.chunks.set(body.id, chunks);
            }
            chunks.buffers.push(body.v);
            chunks.loaded += body.v.byteLength;
            if (this.onChunk)
                this.onChunk(message.id);
            if (progress)
                progress.set(body.total, chunks.loaded);
            if (chunks.loaded === body.total) {
                //we're done
                this.progress.delete(message.id);
                this.chunks.delete(body.id);
                this.chunkAcks.delete(body.id);
                let offset = 0;
                const newBuffer = createBuffer(body.total);
                for (const buffer of chunks.buffers) {
                    newBuffer.set(buffer, offset);
                    offset += buffer.byteLength;
                }
                this.onMessage(readRpcMessage(newBuffer));
            }
        }
        else {
            const progress = this.progress.get(message.id);
            if (progress) {
                progress.set(buffer.byteLength, buffer.byteLength);
                this.progress.delete(message.id);
            }
            this.onMessage(message);
        }
    }
}
export function readUint32LE(buffer, offset = 0) {
    return buffer[offset] + (buffer[offset + 1] * 2 ** 8) + (buffer[offset + 2] * 2 ** 16) + (buffer[offset + 3] * 2 ** 24);
}
export class RpcBufferReader {
    constructor(onMessage) {
        this.onMessage = onMessage;
        this.currentMessageSize = 0;
    }
    emptyBuffer() {
        return this.currentMessage === undefined;
    }
    feed(data, bytes) {
        if (!data.byteLength)
            return;
        if (!bytes)
            bytes = data.byteLength;
        if (!this.currentMessage) {
            if (data.byteLength < 4) {
                //not enough data to read the header. Wait for next onData
                return;
            }
            this.currentMessage = data.byteLength === bytes ? data : data.slice(0, bytes);
            this.currentMessageSize = readUint32LE(data);
        }
        else {
            this.currentMessage = Buffer.concat([this.currentMessage, data.byteLength === bytes ? data : data.slice(0, bytes)]);
            if (!this.currentMessageSize) {
                if (this.currentMessage.byteLength < 4) {
                    //not enough data to read the header. Wait for next onData
                    return;
                }
                this.currentMessageSize = readUint32LE(this.currentMessage);
            }
        }
        let currentSize = this.currentMessageSize;
        let currentBuffer = this.currentMessage;
        while (currentBuffer) {
            if (currentSize > currentBuffer.byteLength) {
                //important to save a copy, since the original buffer might change its content
                this.currentMessage = new Uint8Array(currentBuffer);
                this.currentMessageSize = currentSize;
                //message not completely loaded, wait for next onData
                return;
            }
            if (currentSize === currentBuffer.byteLength) {
                //current buffer is exactly the message length
                this.currentMessageSize = 0;
                this.currentMessage = undefined;
                this.onMessage(currentBuffer);
                return;
            }
            if (currentSize < currentBuffer.byteLength) {
                //we have more messages in this buffer. read what is necessary and hop to next loop iteration
                const message = currentBuffer.slice(0, currentSize);
                this.onMessage(message);
                currentBuffer = currentBuffer.slice(currentSize);
                if (currentBuffer.byteLength < 4) {
                    //not enough data to read the header. Wait for next onData
                    this.currentMessage = currentBuffer;
                    return;
                }
                const nextCurrentSize = readUint32LE(currentBuffer);
                if (nextCurrentSize <= 0)
                    throw new Error('message size wrong');
                currentSize = nextCurrentSize;
                //buffer and size has been set. consume this message in the next loop iteration
            }
        }
    }
}
export function rpcEncodeError(error) {
    let classType = '';
    let stack = '';
    let properties;
    if ('string' !== typeof error) {
        const schema = getClassSchema(error['constructor']);
        stack = error.stack || '';
        if (schema.name) {
            classType = schema.name;
            if (schema.getPropertiesMap().size) {
                properties = jsonSerializer.for(schema).serialize(error);
            }
        }
    }
    return {
        classType,
        properties,
        stack,
        message: 'string' === typeof error ? error : error.message,
    };
}
export function rpcDecodeError(error) {
    if (error.classType) {
        const entity = getGlobalStore().RegisteredEntities[error.classType];
        if (!entity) {
            throw new Error(`Could not find an entity named ${error.classType} for an error thrown. ` +
                `Make sure the class is loaded and correctly defined using @entity.name(${JSON.stringify(error.classType)})`);
        }
        const classType = getClassSchema(entity).classType;
        if (error.properties) {
            const e = jsonSerializer.for(getClassSchema(entity)).deserialize(error.properties);
            e.stack = error.stack + '\nat ___SERVER___';
            return e;
        }
        return new classType(error.message);
    }
    const e = new Error(error.message);
    e.stack = error.stack + '\nat ___SERVER___';
    return e;
}
//# sourceMappingURL=protocol.js.map