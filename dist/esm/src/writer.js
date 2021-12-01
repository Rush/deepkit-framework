/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { BehaviorSubject, Subject } from 'rxjs';
import { rpcChunk, RpcTypes } from './model';
import { createRpcMessage, readRpcMessage } from './protocol';
export class SingleProgress extends Subject {
    constructor() {
        super();
        this.done = false;
        this.total = 0;
        this.current = 0;
        this.stats = 0;
        this.lastTime = 0;
        this.finished = new Promise((resolve) => {
            this.triggerFinished = resolve;
        });
    }
    /**
     * Acts like a BehaviorSubject.
     */
    _subscribe(subscriber) {
        const subscription = super._subscribe(subscriber);
        if (subscription && !subscription.closed) {
            subscriber.next(this);
        }
        return subscription;
    }
    setStart(total) {
        this.total = total;
        this.lastTime = Date.now();
    }
    setBatch(size) {
        this.current += size;
        this.lastTime = Date.now();
    }
    get progress() {
        if (this.done)
            return 1;
        if (this.total === 0)
            return 0;
        return this.current / this.total;
    }
    set(total, current) {
        if (this.done)
            return;
        this.total = total;
        this.current = current;
        this.done = total === current;
        this.stats++;
        this.next(this);
        if (this.done) {
            this.complete();
            if (this.triggerFinished)
                this.triggerFinished();
        }
    }
}
export class Progress extends BehaviorSubject {
    constructor() {
        super(0);
        this.upload = new SingleProgress;
        this.download = new SingleProgress;
    }
}
export class RpcMessageWriterOptions {
    constructor() {
        /**
         * Stores big buffers to the file system and stream it from there.
         * In bytes.
         * note: not implemented yet
         */
        this.cacheOnFileSystemWhenSizeIsAtLeast = 100000000;
        /**
         * When back-pressure is bigger than this value, we wait with sending new data.
         * In bytes.
         * note: not implemented yet
         */
        this.stepBackWhenBackPressureBiggerThan = 5000000;
        /**
         * Chunk size.
         * In bytes.
         */
        this.chunkSize = 100000;
    }
}
/**
 * This class acts as a layer between kernel/client and a connection writer.
 * It automatically chunks long messages into multiple smaller one using the RpcType.Chunks type.
 *
 * todo:
 * It keeps track of the back-pressure and sends only when the pressure is not too big.
 * It automatically saves big buffer to the file system and streams data from there to not
 * block valuable memory.
 */
export class RpcMessageWriter {
    constructor(writer, reader, options) {
        this.writer = writer;
        this.reader = reader;
        this.options = options;
        this.chunkId = 0;
    }
    close() {
        this.writer.close();
    }
    write(buffer, progress) {
        this.writeFull(buffer, progress).catch(error => console.log('RpcMessageWriter writeAsync error', error));
    }
    async writeFull(buffer, progress) {
        if (buffer.byteLength >= this.options.chunkSize) {
            //split up
            const chunkId = this.chunkId++;
            const message = readRpcMessage(buffer); //we need the original message-id, so the chunks are correctly assigned in Progress tracker
            let offset = 0;
            while (offset < buffer.byteLength) {
                //todo: check back-pressure and wait if necessary
                const slice = buffer.slice(offset, offset + this.options.chunkSize);
                const chunkMessage = createRpcMessage(message.id, RpcTypes.Chunk, rpcChunk, {
                    id: chunkId,
                    total: buffer.byteLength,
                    v: slice
                });
                offset += slice.byteLength;
                const promise = new Promise((resolve) => {
                    this.reader.onChunkAck(message.id, resolve);
                });
                this.writer.write(chunkMessage);
                await promise;
                progress === null || progress === void 0 ? void 0 : progress.set(buffer.byteLength, offset);
            }
        }
        else {
            this.writer.write(buffer);
            progress === null || progress === void 0 ? void 0 : progress.set(buffer.byteLength, buffer.byteLength);
        }
    }
}
export class ClientProgress {
    /**
     * Returns the current stack and sets a new one.
     */
    static getNext() {
        if (ClientProgress.nextProgress) {
            const old = ClientProgress.nextProgress;
            ClientProgress.nextProgress = undefined;
            return old;
        }
        return undefined;
    }
    /**
     * Sets up a new Progress object for the next API request to be made.
     * Only the very next API call will be tracked.
     *
     * @example
     * ```typescript
     *
     * ClientProgress.track();
     * await api.myMethod();
     *
     * ```
     */
    static track() {
        const progress = new Progress;
        ClientProgress.nextProgress = progress;
        return progress;
    }
}
//# sourceMappingURL=writer.js.map