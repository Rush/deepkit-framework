import { ClassType } from '@deepkit/core';
import { ClassSchema, PropertySchema, ValidationFailedItem } from '@deepkit/type';
import { Observable, Subject, Subscription } from 'rxjs';
import { Collection } from '../collection';
import { RpcMessage } from '../protocol';
import { RpcMessageBuilder } from './kernel';
import { RpcControllerAccess, RpcKernelSecurity, SessionState } from './security';
import { InjectorContext, InjectorModule } from '@deepkit/injector';
export declare type ActionTypes = {
    parameters: PropertySchema[];
    parameterSchema: ClassSchema;
    parametersDeserialize: (value: any) => any;
    parametersValidate: (value: any, path?: string, errors?: ValidationFailedItem[]) => ValidationFailedItem[];
    resultProperty: PropertySchema;
    resultPropertyChanged: number;
    resultSchema: ClassSchema<{
        v?: any;
    }>;
    observableNextSchema: ClassSchema;
    collectionSchema?: ClassSchema<{
        v: any[];
    }>;
};
export declare class RpcServerAction {
    protected controllers: Map<string, {
        controller: ClassType;
        module?: InjectorModule;
    }>;
    protected injector: InjectorContext;
    protected security: RpcKernelSecurity;
    protected sessionState: SessionState;
    protected cachedActionsTypes: {
        [id: string]: ActionTypes;
    };
    protected observableSubjects: {
        [id: number]: {
            subject: Subject<any>;
            completedByClient: boolean;
            subscription: Subscription;
        };
    };
    protected collections: {
        [id: number]: {
            collection: Collection<any>;
            unsubscribe: () => void;
        };
    };
    protected observables: {
        [id: number]: {
            observable: Observable<any>;
            classType: ClassType;
            method: string;
            types: ActionTypes;
            subscriptions: {
                [id: number]: {
                    sub?: Subscription;
                    active: boolean;
                    complete: () => void;
                };
            };
        };
    };
    constructor(controllers: Map<string, {
        controller: ClassType;
        module?: InjectorModule;
    }>, injector: InjectorContext, security: RpcKernelSecurity, sessionState: SessionState);
    handleActionTypes(message: RpcMessage, response: RpcMessageBuilder): Promise<void>;
    onClose(): Promise<void>;
    protected hasControllerAccess(controllerAccess: RpcControllerAccess): Promise<boolean>;
    protected loadTypes(controller: string, method: string): Promise<ActionTypes>;
    handle(message: RpcMessage, response: RpcMessageBuilder): Promise<void>;
    handleAction(message: RpcMessage, response: RpcMessageBuilder): Promise<void>;
}
export declare function createNewPropertySchemaIfNecessary(result: any, property: PropertySchema, fromPromise?: boolean): PropertySchema | undefined;
export declare function isResultTypeDifferent(result: any, property: PropertySchema): boolean;
