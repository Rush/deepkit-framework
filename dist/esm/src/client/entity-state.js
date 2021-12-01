/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { arrayRemoveItem, deletePathValue, getPathValue, setPathValue } from "@deepkit/core";
import { getClassSchema, jsonSerializer } from "@deepkit/type";
import { EntitySubject, rpcEntityPatch, rpcEntityRemove, RpcTypes } from "../model";
export class EntitySubjectStore {
    constructor(schema) {
        this.schema = schema;
        this.store = new Map();
        this.onCreation = new Map();
    }
    isRegistered(id) {
        return this.store.has(id);
    }
    register(item) {
        this.store.set(item.id, { item: item, forks: [] });
        const store = this.onCreation.get(item.id);
        if (store) {
            for (const c of store.calls)
                c();
            this.onCreation.delete(item.id);
        }
    }
    deregister(id) {
        this.store.delete(id);
    }
    getItem(id) {
        var _a;
        return (_a = this.store.get(id)) === null || _a === void 0 ? void 0 : _a.item;
    }
    registerOnCreation(id, call) {
        let store = this.onCreation.get(id);
        if (!store) {
            store = { calls: [] };
            this.onCreation.set(id, store);
        }
        store.calls.push(call);
    }
    onDelete(id) {
        const store = this.store.get(id);
        if (!store)
            return;
        for (const fork of store.forks) {
            fork.delete.next(true);
        }
        this.deregister(id);
    }
    onSet(id, item) {
        const store = this.store.get(id);
        if (!store) {
            this.registerOnCreation(id, () => this.onSet(id, item));
            return;
        }
        store.item = item;
        for (const fork of store.forks) {
            fork.next(item);
        }
    }
    onPatch(id, version, patch) {
        const store = this.store.get(id);
        if (!store) {
            //it might happen that we receive patches before we actually have the entity registered
            //in this case, we schedule the same call for later, when the actual item is registered.
            this.registerOnCreation(id, () => this.onPatch(id, version, patch));
            return;
        }
        if (store.item.version === version) {
            return;
        }
        store.item.version = version;
        if (patch.$set) {
            const $set = jsonSerializer.for(this.schema).patchDeserialize(patch.$set);
            for (const i in $set) {
                setPathValue(store.item, i, $set[i]);
            }
        }
        if (patch.$inc)
            for (const i in patch.$inc) {
                if (i === 'version')
                    continue;
                setPathValue(store.item, i, getPathValue(store.item, i) + patch.$inc[i]);
            }
        if (patch.$unset)
            for (const i in patch.$unset) {
                deletePathValue(store.item, i);
            }
        for (const fork of store.forks) {
            fork.patches.next(patch);
            fork.next(store.item);
        }
    }
    forkUnregistered(id, fork) {
        const store = this.store.get(id);
        if (!store)
            return;
        arrayRemoveItem(store.forks, fork);
        if (store.forks.length === 0) {
            this.deregister(id);
        }
    }
    /**
     * Before calling createFork you must be sure the item is already registered.
     */
    createFork(id) {
        let store = this.store.get(id);
        if (!store)
            throw new Error('Could not create fork from unknown item ' + id);
        const fork = new EntitySubject(store.item, () => {
            this.forkUnregistered(id, fork);
        });
        store.forks.push(fork);
        return fork;
    }
    getForkCount(id) {
        const store = this.store.get(id);
        return store ? store.forks.length : 0;
    }
    getEntitySubjectCount() {
        return this.store.size;
    }
}
export class EntityState {
    constructor() {
        this.store = new Map();
        this.storeByName = new Map();
    }
    getStore(classType) {
        const schema = getClassSchema(classType);
        let store = this.store.get(schema);
        if (!store) {
            store = new EntitySubjectStore(schema);
            this.store.set(schema, store);
            this.storeByName.set(schema.getName(), store);
        }
        return store;
    }
    getStoreByName(name) {
        let store = this.storeByName.get(name);
        if (!store)
            throw new Error(`No store for entity ${name}`);
        return store;
    }
    createEntitySubject(classSchema, bodySchema, message) {
        if (message.type !== RpcTypes.ResponseEntity)
            throw new Error('Not a response entity message');
        const item = message.parseBody(bodySchema).v;
        const store = this.getStore(classSchema);
        if (!store.isRegistered(item.id))
            store.register(item);
        return store.createFork(item.id);
    }
    /**
     * Handles the RpcType.Entity, which is a composite per default.
     */
    handle(entityMessage) {
        for (const message of entityMessage.getBodies()) {
            switch (message.type) {
                case RpcTypes.EntityPatch: {
                    //todo, use specialized ClassSchema, so we get correct instance types returned. We need however first deepkit/bson patch support
                    // at the moment this happens in onPatch using jsonSerializer
                    const body = message.parseBody(rpcEntityPatch);
                    const store = this.getStoreByName(body.entityName);
                    store.onPatch(body.id, body.version, body.patch);
                    break;
                }
                case RpcTypes.EntityRemove: {
                    const body = message.parseBody(rpcEntityRemove);
                    for (const id of body.ids) {
                        const store = this.getStoreByName(body.entityName);
                        store.onDelete(id);
                    }
                    break;
                }
            }
        }
    }
}
//# sourceMappingURL=entity-state.js.map