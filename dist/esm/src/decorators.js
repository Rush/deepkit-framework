/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
import { createClassDecoratorContext, createPropertyDecoratorContext, getClassSchema, mergeDecorator, } from '@deepkit/type';
class RpcController {
    constructor() {
        this.actions = new Map();
    }
    getPath() {
        return this.definition ? this.definition.path : this.name || '';
    }
}
export class RpcAction {
    constructor() {
        this.category = '';
        this.description = '';
        this.groups = [];
        this.data = {};
    }
}
class RpcClass {
    constructor() {
        this.t = new RpcController;
    }
    controller(nameOrDefinition) {
        if ('string' === typeof nameOrDefinition) {
            this.t.name = nameOrDefinition;
        }
        else {
            this.t.definition = nameOrDefinition;
        }
    }
    addAction(name, action) {
        this.t.actions.set(name, action);
    }
}
export const rpcClass = createClassDecoratorContext(RpcClass);
class RpcProperty {
    constructor() {
        this.t = new RpcAction;
    }
    onDecorator(classType, property) {
        this.t.name = property;
        this.t.classType = classType;
        rpcClass.addAction(property, this.t)(classType);
    }
    action() {
    }
    category(name) {
        this.t.category = name;
    }
    description(text) {
        this.t.description = text;
    }
    group(...groups) {
        this.t.groups.push(...groups);
    }
    data(name, value) {
        this.t.data[name] = value;
    }
}
export const rpcProperty = createPropertyDecoratorContext(RpcProperty);
export const rpc = mergeDecorator(rpcClass, rpcProperty);
export function getActionParameters(target, method) {
    return getClassSchema(target).getMethodProperties(method);
}
export function getActions(target) {
    const parent = Object.getPrototypeOf(target);
    const results = parent ? getActions(parent) : new Map();
    const data = rpcClass._fetch(target);
    if (!data)
        return results;
    for (const action of data.actions.values()) {
        const existing = results.get(action.name);
        if (existing) {
            existing.groups.push(...action.groups);
            Object.assign(existing.data, action.data);
        }
        else {
            results.set(action.name, action);
        }
    }
    return results;
}
//# sourceMappingURL=decorators.js.map