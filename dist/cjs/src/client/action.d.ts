import { ClassSchema, PropertySchema } from '@deepkit/type';
import { Collection } from '../collection';
import { RpcMessage } from '../protocol';
import type { WritableClient } from './client';
import { EntityState, EntitySubjectStore } from './entity-state';
declare type ControllerStateActionTypes = {
    parameters: string[];
    parameterSchema: ClassSchema;
    resultSchema: ClassSchema<{
        v?: any;
    }>;
    resultProperty: PropertySchema;
    observableNextSchema: ClassSchema<{
        id: number;
        v: any;
    }>;
    collectionSchema?: ClassSchema<{
        v: any[];
    }>;
};
declare type ControllerStateActionState = {
    promise?: Promise<ControllerStateActionTypes>;
    types?: ControllerStateActionTypes;
};
export declare class RpcControllerState {
    controller: string;
    protected state: {
        [method: string]: ControllerStateActionState;
    };
    peerId?: string;
    constructor(controller: string);
    getState(method: string): ControllerStateActionState;
}
export declare class RpcActionClient {
    protected client: WritableClient;
    entityState: EntityState;
    constructor(client: WritableClient);
    action<T>(controller: RpcControllerState, method: string, args: any[], options?: {
        timeout?: number;
        dontWaitForConnection?: true;
        typeReuseDisabled?: boolean;
    }): Promise<any>;
    protected handleCollection(entityStore: EntitySubjectStore<any>, types: ControllerStateActionTypes, collection: Collection<any>, messages: RpcMessage[]): void;
    loadActionTypes(controller: RpcControllerState, method: string, options?: {
        timeout?: number;
        dontWaitForConnection?: true;
        typeReuseDisabled?: boolean;
    }): Promise<ControllerStateActionTypes>;
}
export {};
