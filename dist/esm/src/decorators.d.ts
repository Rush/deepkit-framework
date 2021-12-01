import { ClassType } from '@deepkit/core';
import { ClassDecoratorResult, PropertyDecoratorResult, PropertySchema } from '@deepkit/type';
import { ControllerDefinition } from './model';
declare class RpcController {
    name?: string;
    definition?: ControllerDefinition<any>;
    actions: Map<string, RpcAction>;
    getPath(): string;
}
export declare class RpcAction {
    name: string;
    classType: ClassType;
    category: string;
    description: string;
    groups: string[];
    data: {
        [name: string]: any;
    };
}
declare class RpcClass {
    t: RpcController;
    controller(nameOrDefinition: string | ControllerDefinition<any>): void;
    addAction(name: string, action: RpcAction): void;
}
export declare const rpcClass: ClassDecoratorResult<typeof RpcClass>;
declare class RpcProperty {
    t: RpcAction;
    onDecorator(classType: ClassType, property: string): void;
    action(): void;
    category(name: string): void;
    description(text: string): void;
    group(...groups: string[]): void;
    data(name: string, value: any): void;
}
export declare const rpcProperty: PropertyDecoratorResult<typeof RpcProperty>;
export declare const rpc: typeof rpcClass & typeof rpcProperty;
export declare function getActionParameters<T>(target: ClassType<T>, method: string): PropertySchema[];
export declare function getActions<T>(target: ClassType<T>): Map<string, RpcAction>;
export {};
