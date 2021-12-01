"use strict";
/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isResultTypeDifferent = exports.createNewPropertySchemaIfNecessary = exports.RpcServerAction = void 0;
const core_1 = require("@deepkit/core");
const core_rxjs_1 = require("@deepkit/core-rxjs");
const type_1 = require("@deepkit/type");
const rxjs_1 = require("rxjs");
const collection_1 = require("../collection");
const decorators_1 = require("../decorators");
const model_1 = require("../model");
const protocol_1 = require("../protocol");
class RpcServerAction {
    constructor(controllers, injector, security, sessionState) {
        this.controllers = controllers;
        this.injector = injector;
        this.security = security;
        this.sessionState = sessionState;
        this.cachedActionsTypes = {};
        this.observableSubjects = {};
        this.collections = {};
        this.observables = {};
    }
    async handleActionTypes(message, response) {
        const body = message.parseBody(model_1.rpcActionType);
        const types = await this.loadTypes(body.controller, body.method);
        response.reply(model_1.RpcTypes.ResponseActionType, model_1.rpcResponseActionType, {
            parameters: types.parameters.map(v => v.toJSONNonReference(undefined, body.disableTypeReuse)),
            result: types.resultSchema.getProperty('v').toJSONNonReference(undefined, body.disableTypeReuse),
            next: types.observableNextSchema.getProperty('v').toJSONNonReference(undefined, body.disableTypeReuse),
        });
    }
    async onClose() {
        for (const collection of Object.values(this.collections)) {
            if (!collection.collection.closed) {
                collection.unsubscribe();
                collection.collection.unsubscribe();
            }
        }
        for (const observable of Object.values(this.observables)) {
            for (const sub of Object.values(observable.subscriptions)) {
                if (sub.sub && !sub.sub.closed)
                    sub.sub.unsubscribe();
            }
        }
        for (const subject of Object.values(this.observableSubjects)) {
            if (!subject.subject.closed)
                subject.subject.complete();
        }
    }
    async hasControllerAccess(controllerAccess) {
        return await this.security.hasControllerAccess(this.sessionState.getSession(), controllerAccess);
    }
    async loadTypes(controller, method) {
        const cacheId = controller + '!' + method;
        let types = this.cachedActionsTypes[cacheId];
        if (types)
            return types;
        const classType = this.controllers.get(controller);
        if (!classType) {
            throw new Error(`No controller registered for id ${controller}`);
        }
        const action = decorators_1.getActions(classType.controller).get(method);
        if (!action) {
            throw new Error(`Action unknown ${method}`);
        }
        const controllerAccess = {
            controllerName: controller, actionName: method, controllerClassType: classType.controller,
            actionGroups: action.groups, actionData: action.data
        };
        if (!await this.hasControllerAccess(controllerAccess)) {
            throw new Error(`Access denied to action ${method}`);
        }
        const parameters = decorators_1.getActionParameters(classType.controller, method);
        const argSchema = type_1.createClassSchema();
        for (let i = 0; i < parameters.length; i++) {
            argSchema.registerProperty(parameters[i]);
        }
        let resultProperty = type_1.getClassSchema(classType.controller).getMethod(method).clone();
        if (resultProperty.type === 'class' && resultProperty.classType) {
            const generic = resultProperty.templateArgs[0];
            if (generic) {
                resultProperty = generic.clone();
            }
            else {
                //if its Observable, Collection, EntitySubject, we simply assume any, because sending those types as resultProperty is definitely wrong
                //and result in weird errors when `undefined` is returned in the actual action (since from undefined we don't infer an actual type)
                if (core_1.isPrototypeOfBase(resultProperty.classType, rxjs_1.Observable)
                    || core_1.isPrototypeOfBase(resultProperty.classType, collection_1.Collection)
                    || core_1.isPrototypeOfBase(resultProperty.classType, model_1.EntitySubject)) {
                    resultProperty.type = 'any';
                    resultProperty.typeSet = false; //to signal the user hasn't defined a type
                }
            }
        }
        resultProperty.name = 'v';
        resultProperty.isOptional = true;
        const observableNextSchema = model_1.rpcActionObservableSubscribeId.clone();
        let nextProperty = resultProperty;
        if (nextProperty.type === 'promise' && nextProperty.getSubType()) {
            nextProperty = resultProperty.getSubType().clone();
            nextProperty.name = 'v';
        }
        if (nextProperty.type === 'class' && nextProperty.templateArgs[0]) {
            nextProperty = nextProperty.templateArgs[0].clone();
            nextProperty.name = 'v';
        }
        observableNextSchema.registerProperty(nextProperty);
        const resultSchema = type_1.createClassSchema();
        resultSchema.registerProperty(resultProperty);
        types = this.cachedActionsTypes[cacheId] = {
            parameters: parameters,
            parameterSchema: type_1.t.schema({ args: argSchema }),
            resultSchema: resultSchema,
            resultProperty: resultProperty,
            resultPropertyChanged: 0,
            parametersDeserialize: type_1.getXToClassFunction(argSchema, type_1.jsonSerializer),
            parametersValidate: type_1.jitValidate(argSchema),
            observableNextSchema
        };
        core_1.toFastProperties(this.cachedActionsTypes);
        return types;
    }
    async handle(message, response) {
        switch (message.type) {
            case model_1.RpcTypes.ActionObservableSubscribe: {
                const observable = this.observables[message.id];
                if (!observable)
                    return response.error(new Error('No observable found'));
                const { types, classType, method } = observable;
                const body = message.parseBody(model_1.rpcActionObservableSubscribeId);
                if (observable.subscriptions[body.id])
                    return response.error(new Error('Subscription already created'));
                const sub = {
                    active: true,
                    complete: () => {
                        sub.active = false;
                        if (sub.sub)
                            sub.sub.unsubscribe();
                        response.reply(model_1.RpcTypes.ResponseActionObservableComplete, model_1.rpcActionObservableSubscribeId, {
                            id: body.id
                        });
                    }
                };
                observable.subscriptions[body.id] = sub;
                sub.sub = observable.observable.subscribe((next) => {
                    const newProperty = createNewPropertySchemaIfNecessary(next, types.resultProperty);
                    if (newProperty) {
                        types.observableNextSchema = model_1.rpcActionObservableSubscribeId.clone();
                        types.observableNextSchema.registerProperty(newProperty);
                        types.resultProperty = newProperty;
                        types.resultPropertyChanged++;
                        if (types.resultPropertyChanged === 10) {
                            console.warn(`The emitted next value of the Observable of method ${core_1.getClassPropertyName(classType, method)} changed 10 times. You should add a @t.union() annotation to improve serialization performance.`);
                        }
                        response.reply(model_1.RpcTypes.ResponseActionReturnType, type_1.propertyDefinition, newProperty.toJSONNonReference());
                    }
                    if (!sub.active)
                        return;
                    response.reply(model_1.RpcTypes.ResponseActionObservableNext, types.observableNextSchema, {
                        id: body.id,
                        v: next
                    });
                }, (error) => {
                    const extracted = protocol_1.rpcEncodeError(this.security.transformError(error));
                    response.reply(model_1.RpcTypes.ResponseActionObservableError, model_1.rpcResponseActionObservableSubscriptionError, { ...extracted, id: body.id });
                }, () => {
                    response.reply(model_1.RpcTypes.ResponseActionObservableComplete, model_1.rpcActionObservableSubscribeId, {
                        id: body.id
                    });
                });
                break;
            }
            case model_1.RpcTypes.ActionCollectionUnsubscribe: {
                const collection = this.collections[message.id];
                if (!collection)
                    return response.error(new Error('No collection found'));
                collection.unsubscribe();
                delete this.collections[message.id];
                break;
            }
            case model_1.RpcTypes.ActionCollectionModel: {
                const collection = this.collections[message.id];
                if (!collection)
                    return response.error(new Error('No collection found'));
                const body = message.parseBody(type_1.getClassSchema(collection_1.CollectionQueryModel));
                collection.collection.model.set(body);
                collection.collection.model.changed();
                break;
            }
            case model_1.RpcTypes.ActionObservableUnsubscribe: {
                const observable = this.observables[message.id];
                if (!observable)
                    return response.error(new Error('No observable to unsubscribe found'));
                const body = message.parseBody(model_1.rpcActionObservableSubscribeId);
                const sub = observable.subscriptions[body.id];
                if (!sub)
                    return response.error(new Error('No subscription found'));
                sub.active = false;
                if (sub.sub) {
                    sub.sub.unsubscribe();
                }
                delete observable.subscriptions[body.id];
                break;
            }
            case model_1.RpcTypes.ActionObservableDisconnect: {
                const observable = this.observables[message.id];
                if (!observable)
                    return response.error(new Error('No observable to disconnect found'));
                for (const sub of Object.values(observable.subscriptions)) {
                    sub.complete(); //we send all active subscriptions it was completed
                }
                delete this.observables[message.id];
                break;
            }
            case model_1.RpcTypes.ActionObservableSubjectUnsubscribe: { //aka completed
                const subject = this.observableSubjects[message.id];
                if (!subject)
                    return response.error(new Error('No subject to unsubscribe found'));
                subject.completedByClient = true;
                subject.subject.complete();
                delete this.observableSubjects[message.id];
                break;
            }
        }
    }
    async handleAction(message, response) {
        const body = message.parseBody(model_1.rpcActionType);
        const controller = this.controllers.get(body.controller);
        if (!controller)
            throw new Error(`No controller registered for id ${body.controller}`);
        const types = await this.loadTypes(body.controller, body.method);
        const value = message.parseBody(types.parameterSchema);
        const controllerClassType = this.injector.get(controller.controller, controller.module);
        if (!controllerClassType) {
            response.error(new Error(`No instance of ${core_1.getClassName(controller.controller)} found.`));
        }
        const converted = types.parametersDeserialize(value.args);
        const errors = types.parametersValidate(converted);
        if (errors.length) {
            return response.error(new model_1.ValidationError(errors));
        }
        try {
            let result = controllerClassType[body.method](...Object.values(value.args));
            const isPromise = result instanceof Promise;
            if (isPromise) {
                result = await result;
            }
            if (model_1.isEntitySubject(result)) {
                const newProperty = createNewPropertySchemaIfNecessary(result.value, types.resultProperty);
                if (newProperty) {
                    types.resultSchema = type_1.createClassSchema();
                    types.resultSchema.registerProperty(newProperty);
                    types.resultProperty = newProperty;
                    types.resultPropertyChanged++;
                    response.reply(model_1.RpcTypes.ResponseActionReturnType, type_1.propertyDefinition, newProperty.toJSONNonReference());
                }
                response.reply(model_1.RpcTypes.ResponseEntity, types.resultSchema, { v: result.value });
            }
            else if (collection_1.isCollection(result)) {
                const collection = result;
                const newProperty = new type_1.PropertySchema('v');
                newProperty.setFromJSType(collection.classType);
                types.resultSchema = type_1.createClassSchema();
                types.resultSchema.registerProperty(newProperty);
                types.resultProperty = newProperty;
                types.collectionSchema = type_1.createClassSchema();
                const v = new type_1.PropertySchema('v');
                v.setType('array');
                v.templateArgs.push(newProperty);
                types.collectionSchema.registerProperty(v);
                types.resultPropertyChanged++;
                response.composite(model_1.RpcTypes.ResponseActionCollection)
                    .add(model_1.RpcTypes.ResponseActionReturnType, type_1.propertyDefinition, newProperty.toJSONNonReference())
                    .add(model_1.RpcTypes.ResponseActionCollectionModel, collection_1.CollectionQueryModel, collection.model)
                    .add(model_1.RpcTypes.ResponseActionCollectionState, collection_1.CollectionState, collection.state)
                    .add(model_1.RpcTypes.ResponseActionCollectionSet, types.collectionSchema, { v: collection.all() })
                    .send();
                let unsubscribed = false;
                //we queue many events up for the next microtask using collectForMicrotask, and then send
                //everything as one composite message.
                const eventsSub = collection.event.subscribe(core_1.collectForMicrotask((events) => {
                    if (unsubscribed)
                        return;
                    const composite = response.composite(model_1.RpcTypes.ResponseActionCollectionChange);
                    for (const event of events) {
                        if (event.type === 'add') {
                            //when the user has already a EntitySubject on one of those event.items,
                            //then we technically send it unnecessarily. However, we would have to introduce
                            //a new RpcType to send only the IDs, which is not yet implemented.
                            composite.add(model_1.RpcTypes.ResponseActionCollectionAdd, types.collectionSchema, { v: event.items, });
                        }
                        else if (event.type === 'remove') {
                            composite.add(model_1.RpcTypes.ResponseActionCollectionRemove, model_1.rpcResponseActionCollectionRemove, { ids: event.ids, });
                        }
                        else if (event.type === 'update') {
                            composite.add(model_1.RpcTypes.ResponseActionCollectionUpdate, types.collectionSchema, { v: event.items, });
                        }
                        else if (event.type === 'set') {
                            composite.add(model_1.RpcTypes.ResponseActionCollectionSet, types.collectionSchema, { v: collection.all(), });
                        }
                        else if (event.type === 'state') {
                            composite.add(model_1.RpcTypes.ResponseActionCollectionState, collection_1.CollectionState, collection.state);
                        }
                        else if (event.type === 'sort') {
                            composite.add(model_1.RpcTypes.ResponseActionCollectionSort, model_1.rpcResponseActionCollectionSort, { ids: event.ids, });
                        }
                    }
                    composite.send();
                }));
                collection.addTeardown(() => {
                    const c = this.collections[message.id];
                    if (c)
                        c.unsubscribe();
                });
                this.collections[message.id] = {
                    collection,
                    unsubscribe: () => {
                        if (unsubscribed)
                            return;
                        unsubscribed = true;
                        eventsSub.unsubscribe();
                        collection.unsubscribe();
                    }
                };
            }
            else if (rxjs_1.isObservable(result)) {
                this.observables[message.id] = { observable: result, subscriptions: {}, types, classType: controller.controller, method: body.method };
                let type = model_1.ActionObservableTypes.observable;
                if (core_rxjs_1.isSubject(result)) {
                    type = model_1.ActionObservableTypes.subject;
                    this.observableSubjects[message.id] = {
                        subject: result,
                        completedByClient: false,
                        subscription: result.subscribe((next) => {
                            const newProperty = createNewPropertySchemaIfNecessary(next, types.observableNextSchema.getProperty('v'));
                            if (newProperty) {
                                console.warn(`The emitted next value of method ${core_1.getClassPropertyName(controllerClassType, body.method)} changed from ${types.observableNextSchema.getProperty('v').toString()} to ${newProperty.toString()}. ` +
                                    `You should add a @t.generic(T) annotation to improve serialization performance.`);
                                types.observableNextSchema = model_1.rpcActionObservableSubscribeId.clone();
                                types.observableNextSchema.registerProperty(newProperty);
                                types.resultProperty = newProperty;
                                types.resultPropertyChanged++;
                                response.reply(model_1.RpcTypes.ResponseActionReturnType, type_1.propertyDefinition, newProperty.toJSONNonReference());
                            }
                            response.reply(model_1.RpcTypes.ResponseActionObservableNext, types.observableNextSchema, {
                                id: message.id,
                                v: next
                            });
                        }, (error) => {
                            const extracted = protocol_1.rpcEncodeError(this.security.transformError(error));
                            response.reply(model_1.RpcTypes.ResponseActionObservableError, model_1.rpcResponseActionObservableSubscriptionError, { ...extracted, id: message.id });
                        }, () => {
                            const v = this.observableSubjects[message.id];
                            if (v && v.completedByClient)
                                return; //we don't send ResponseActionObservableComplete when the client issued unsubscribe
                            response.reply(model_1.RpcTypes.ResponseActionObservableComplete, model_1.rpcActionObservableSubscribeId, {
                                id: message.id
                            });
                        })
                    };
                    if (core_rxjs_1.isBehaviorSubject(result)) {
                        type = model_1.ActionObservableTypes.behaviorSubject;
                    }
                }
                response.reply(model_1.RpcTypes.ResponseActionObservable, model_1.rpcResponseActionObservable, { type });
            }
            else {
                const newProperty = createNewPropertySchemaIfNecessary(result, types.resultProperty, isPromise);
                if (newProperty) {
                    console.warn(`The result type of method ${core_1.getClassPropertyName(controllerClassType, body.method)} changed from ${types.resultProperty.toString()} to ${newProperty.toString()}. ` +
                        `You should add a @t annotation to improve serialization performance.`);
                    types.resultSchema = type_1.createClassSchema();
                    types.resultSchema.registerProperty(newProperty);
                    types.resultProperty = newProperty;
                    types.resultPropertyChanged++;
                    const composite = response.composite(model_1.RpcTypes.ResponseActionResult);
                    composite.add(model_1.RpcTypes.ResponseActionReturnType, type_1.propertyDefinition, newProperty.toJSONNonReference());
                    composite.add(model_1.RpcTypes.ResponseActionSimple, types.resultSchema, { v: result });
                    composite.send();
                }
                else {
                    response.reply(model_1.RpcTypes.ResponseActionSimple, types.resultSchema, { v: result });
                }
            }
        }
        catch (error) {
            response.error(this.security.transformError(error));
        }
    }
}
exports.RpcServerAction = RpcServerAction;
function createNewPropertySchemaIfNecessary(result, property, fromPromise = false) {
    if (isResultTypeDifferent(result, property)) {
        const newProperty = new type_1.PropertySchema('v');
        if (fromPromise) {
            newProperty.type = 'promise';
            newProperty.templateArgs[0] = new type_1.PropertySchema('t');
            newProperty.templateArgs[0].setFromJSValue(result);
        }
        else {
            newProperty.setFromJSValue(result);
        }
        return newProperty;
    }
    return undefined;
}
exports.createNewPropertySchemaIfNecessary = createNewPropertySchemaIfNecessary;
function isResultTypeDifferent(result, property) {
    if (property.typeSet)
        return false;
    if (result === null || result === undefined)
        return false;
    if (property.type === 'number' && (typeof result !== 'number' && typeof result !== 'bigint'))
        return true;
    if (property.type === 'string' && (typeof result !== 'string'))
        return true;
    if (property.type === 'uuid' && (typeof result !== 'string'))
        return true;
    if (property.type === 'objectId' && (typeof result !== 'string'))
        return true;
    if (property.type === 'boolean' && (typeof result !== 'boolean'))
        return true;
    if (property.type === 'date' && !(result instanceof Date))
        return true;
    if (property.type === 'arrayBuffer' && !(result instanceof ArrayBuffer))
        return true;
    if (property.type === 'map' && !core_1.isPlainObject(result))
        return true;
    if (property.type === 'array' && !core_1.isArray(result))
        return true;
    if (property.type === 'promise' && !property.templateArgs[0]) {
        //no t.generic was set for promise, so we try to infer it from runtime type
        return true;
    }
    if (property.type === 'any' && !property.typeSet) {
        //type is inferred as Observable, Collection, EntitySubject, so we should try to infer
        //from the result now
        return true;
    }
    if (property.type === 'class') {
        //could be Promise, Observable, Collection, ...
        if (!(result instanceof property.getResolvedClassType()))
            return true;
    }
    return false;
}
exports.isResultTypeDifferent = isResultTypeDifferent;
//# sourceMappingURL=action.js.map