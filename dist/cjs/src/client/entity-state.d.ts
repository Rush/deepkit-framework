import { ClassType } from "@deepkit/core";
import { ClassSchema } from "@deepkit/type";
import { EntityPatch, EntitySubject, IdType, IdVersionInterface } from "../model";
import { RpcMessage } from "../protocol";
export declare class EntitySubjectStore<T extends IdVersionInterface> {
    protected schema: ClassSchema<T>;
    store: Map<IdType, {
        item: T;
        forks: EntitySubject<T>[];
    }>;
    onCreation: Map<IdType, {
        calls: Function[];
    }>;
    constructor(schema: ClassSchema<T>);
    isRegistered(id: IdType): boolean;
    register(item: T): void;
    deregister(id: IdType): void;
    getItem(id: IdType): T | undefined;
    protected registerOnCreation(id: IdType, call: Function): void;
    onDelete(id: IdType): void;
    onSet(id: IdType, item: T): void;
    onPatch(id: IdType, version: number, patch: EntityPatch): void;
    protected forkUnregistered(id: IdType, fork: EntitySubject<T>): void;
    /**
     * Before calling createFork you must be sure the item is already registered.
     */
    createFork(id: IdType): EntitySubject<T>;
    getForkCount(id: IdType): number;
    getEntitySubjectCount(): number;
}
export declare class EntityState {
    private readonly store;
    private readonly storeByName;
    getStore<T extends IdVersionInterface>(classType: ClassType<T> | ClassSchema<T>): EntitySubjectStore<T>;
    getStoreByName<T extends IdVersionInterface>(name: string): EntitySubjectStore<T>;
    createEntitySubject(classSchema: ClassSchema, bodySchema: ClassSchema<{
        v?: any;
    }>, message: RpcMessage): EntitySubject<any>;
    /**
     * Handles the RpcType.Entity, which is a composite per default.
     */
    handle(entityMessage: RpcMessage): void;
}
