/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { asyncOperation, CustomError } from '@deepkit/core';
import { RpcTypes } from '../model';
export class UnexpectedMessageType extends CustomError {
}
export class RpcMessageSubject {
    constructor(continuation, 
    /**
     * Releases this subject. It is necessary that eventually every created subject is released,
     * otherwise dramatic performance decrease and memory leak will happen.
     */
    release) {
        this.continuation = continuation;
        this.release = release;
        this.catchOnReplyCallback = this.onReplyCallback.bind(this);
    }
    onReplyCallback(next) {
        this.uncatchedNext = next;
    }
    next(next) {
        this.onReplyCallback(next);
    }
    onReply(callback) {
        this.onReplyCallback = callback;
        if (this.uncatchedNext) {
            callback(this.uncatchedNext);
            this.uncatchedNext = undefined;
        }
        return this;
    }
    /**
     * Sends a message to the server in the context of this created subject.
     * If the connection meanwhile has been reconnected, and completed MessageSubject.
     */
    send(type, schema, body) {
        this.continuation(type, schema, body);
        return this;
    }
    async ackThenClose() {
        return asyncOperation((resolve, reject) => {
            this.onReply((next) => {
                this.onReplyCallback = this.catchOnReplyCallback;
                this.release();
                if (next.type === RpcTypes.Ack) {
                    return resolve(undefined);
                }
                if (next.isError()) {
                    return reject(next.getError());
                }
                reject(new UnexpectedMessageType(`Expected message type Ack, but received ${next.type}`));
            });
        });
    }
    async waitNextMessage() {
        return asyncOperation((resolve, reject) => {
            this.onReply((next) => {
                this.onReplyCallback = this.catchOnReplyCallback;
                return resolve(next);
            });
        });
    }
    async waitNext(type, schema) {
        return asyncOperation((resolve, reject) => {
            this.onReply((next) => {
                this.onReplyCallback = this.catchOnReplyCallback;
                if (next.type === type) {
                    return resolve(schema ? next.parseBody(schema) : undefined);
                }
                if (next.isError()) {
                    this.release();
                    return reject(next.getError());
                }
                reject(new UnexpectedMessageType(`Expected message type ${type}, but received ${next.type}`));
            });
        });
    }
    async firstThenClose(type, schema) {
        return asyncOperation((resolve, reject) => {
            this.onReply((next) => {
                this.onReplyCallback = this.catchOnReplyCallback;
                this.release();
                if (next.type === type) {
                    return resolve(schema ? next.parseBody(schema) : next);
                }
                if (next.isError()) {
                    this.release();
                    return reject(next.getError());
                }
                reject(new UnexpectedMessageType(`Expected message type ${type}, but received ${next.type}`));
            });
        });
    }
}
//# sourceMappingURL=message-subject.js.map