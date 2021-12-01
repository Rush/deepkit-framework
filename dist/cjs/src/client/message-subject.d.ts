import { CustomError } from '@deepkit/core';
import { ClassSchema, ExtractClassType } from '@deepkit/type';
import type { RpcMessage } from '../protocol';
export declare class UnexpectedMessageType extends CustomError {
}
export declare class RpcMessageSubject {
    private continuation;
    /**
     * Releases this subject. It is necessary that eventually every created subject is released,
     * otherwise dramatic performance decrease and memory leak will happen.
     */
    release: () => void;
    protected uncatchedNext?: RpcMessage;
    protected onReplyCallback(next: RpcMessage): void;
    protected catchOnReplyCallback: (next: RpcMessage) => void;
    constructor(continuation: <T>(type: number, schema?: ClassSchema<T>, body?: T) => void, 
    /**
     * Releases this subject. It is necessary that eventually every created subject is released,
     * otherwise dramatic performance decrease and memory leak will happen.
     */
    release: () => void);
    next(next: RpcMessage): void;
    onReply(callback: (next: RpcMessage) => void): this;
    /**
     * Sends a message to the server in the context of this created subject.
     * If the connection meanwhile has been reconnected, and completed MessageSubject.
     */
    send<T>(type: number, schema?: ClassSchema<T>, body?: T): this;
    ackThenClose(): Promise<undefined>;
    waitNextMessage<T extends ClassSchema>(): Promise<RpcMessage>;
    waitNext<T extends ClassSchema>(type: number, schema?: T): Promise<undefined extends T ? undefined : ExtractClassType<T>>;
    firstThenClose<T extends ClassSchema>(type: number, schema?: T): Promise<undefined extends T ? RpcMessage : ExtractClassType<T>>;
}
