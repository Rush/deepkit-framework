import { BehaviorSubject, Subject, Subscriber, Subscription } from 'rxjs';
import { RpcMessageReader } from './protocol';
import type { RpcConnectionWriter } from './server/kernel';
export declare class SingleProgress extends Subject<SingleProgress> {
    done: boolean;
    total: number;
    current: number;
    stats: number;
    protected lastTime: number;
    protected triggerFinished?: Function;
    finished: Promise<unknown>;
    constructor();
    /**
     * Acts like a BehaviorSubject.
     */
    _subscribe(subscriber: Subscriber<SingleProgress>): Subscription;
    setStart(total: number): void;
    setBatch(size: number): void;
    get progress(): number;
    set(total: number, current: number): void;
}
export declare class Progress extends BehaviorSubject<number> {
    readonly upload: SingleProgress;
    readonly download: SingleProgress;
    constructor();
}
export declare class RpcMessageWriterOptions {
    /**
     * Stores big buffers to the file system and stream it from there.
     * In bytes.
     * note: not implemented yet
     */
    cacheOnFileSystemWhenSizeIsAtLeast: number;
    /**
     * When back-pressure is bigger than this value, we wait with sending new data.
     * In bytes.
     * note: not implemented yet
     */
    stepBackWhenBackPressureBiggerThan: number;
    /**
     * Chunk size.
     * In bytes.
     */
    chunkSize: number;
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
export declare class RpcMessageWriter implements RpcConnectionWriter {
    protected writer: RpcConnectionWriter;
    protected reader: RpcMessageReader;
    protected options: RpcMessageWriterOptions;
    protected chunkId: number;
    constructor(writer: RpcConnectionWriter, reader: RpcMessageReader, options: RpcMessageWriterOptions);
    close(): void;
    write(buffer: Uint8Array, progress?: SingleProgress): void;
    writeFull(buffer: Uint8Array, progress?: SingleProgress): Promise<void>;
}
export declare class ClientProgress {
    static nextProgress?: Progress;
    /**
     * Returns the current stack and sets a new one.
     */
    static getNext(): Progress | undefined;
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
    static track(): Progress;
}
