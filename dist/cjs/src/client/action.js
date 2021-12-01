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
exports.RpcActionClient = exports.RpcControllerState = void 0;
const core_1 = require("@deepkit/core");
const type_1 = require("@deepkit/type");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const collection_1 = require("../collection");
const model_1 = require("../model");
const protocol_1 = require("../protocol");
const writer_1 = require("../writer");
const entity_state_1 = require("./entity-state");
class RpcControllerState {
    constructor(controller) {
        this.controller = controller;
        this.state = {};
    }
    getState(method) {
        let state = this.state[method];
        if (state)
            return state;
        state = this.state[method] = {};
        core_1.toFastProperties(this.state);
        return state;
    }
}
exports.RpcControllerState = RpcControllerState;
function setReturnType(types, prop) {
    const resultProperty = type_1.PropertySchema.fromJSON(prop);
    resultProperty.name = 'v';
    const resultSchema = type_1.createClassSchema();
    resultSchema.registerProperty(resultProperty);
    types.resultProperty = resultProperty;
    types.resultSchema = resultSchema;
    types.collectionSchema = type_1.createClassSchema();
    const v = new type_1.PropertySchema('v');
    v.setType('array');
    v.templateArgs.push(resultProperty);
    types.collectionSchema.registerProperty(v);
    const observableNextSchema = model_1.rpcActionObservableSubscribeId.clone();
    observableNextSchema.registerProperty(resultProperty);
    types.observableNextSchema = observableNextSchema;
}
class RpcActionClient {
    constructor(client) {
        this.client = client;
        this.entityState = new entity_state_1.EntityState;
    }
    action(controller, method, args, options = {}) {
        const progress = writer_1.ClientProgress.getNext();
        return core_1.asyncOperation(async (resolve, reject) => {
            var _a;
            try {
                const types = ((_a = controller.getState(method)) === null || _a === void 0 ? void 0 : _a.types) || await this.loadActionTypes(controller, method, options);
                // console.log('client types', types.parameterSchema.getProperty('args').getResolvedClassSchema().toString(), )
                const argsObject = {};
                for (let i = 0; i < args.length; i++) {
                    argsObject[types.parameters[i]] = args[i];
                }
                let observable;
                let observableSubject;
                //necessary for BehaviorSubject, since we get ObservableNext before the Observable type call
                let firstObservableNextCalled = false;
                let firstObservableNext;
                let collection;
                let collectionEntityStore;
                let subscriberId = 0;
                const subscribers = {};
                writer_1.ClientProgress.nextProgress = progress;
                const subject = this.client.sendMessage(model_1.RpcTypes.Action, types.parameterSchema, {
                    controller: controller.controller,
                    method: method,
                    args: argsObject
                }, {
                    peerId: controller.peerId,
                    dontWaitForConnection: options.dontWaitForConnection,
                    timeout: options.timeout,
                }).onReply((reply) => {
                    try {
                        // console.log('client: answer', RpcTypes[reply.type], reply.composite);
                        if (reply.type === model_1.RpcTypes.ResponseActionResult) {
                            const bodies = reply.getBodies();
                            if (bodies.length === 2) {
                                //we got returnType
                                if (bodies[0].type !== model_1.RpcTypes.ResponseActionReturnType)
                                    return reject(new Error('RpcTypes.ResponseActionResult should contain as first body RpcTypes.ResponseActionReturnType'));
                                setReturnType(types, bodies[0].parseBody(type_1.propertyDefinition));
                                reply = bodies[1];
                            }
                            else {
                                reply = bodies[0];
                            }
                        }
                        switch (reply.type) {
                            case model_1.RpcTypes.ResponseEntity: {
                                resolve(this.entityState.createEntitySubject(types.resultProperty.getResolvedClassSchema(), types.resultSchema, reply));
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionSimple: {
                                subject.release();
                                const result = reply.parseBody(types.resultSchema);
                                resolve(result.v);
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionReturnType: {
                                setReturnType(types, reply.parseBody(type_1.propertyDefinition));
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionObservableError: {
                                const body = reply.parseBody(model_1.rpcResponseActionObservableSubscriptionError);
                                const error = protocol_1.rpcDecodeError(body);
                                if (observable) {
                                    if (!subscribers[body.id])
                                        return; //we silently ignore this
                                    subscribers[body.id].error(error);
                                }
                                else if (observableSubject) {
                                    observableSubject.error(error);
                                }
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionObservableComplete: {
                                const body = reply.parseBody(model_1.rpcActionObservableSubscribeId);
                                if (observable) {
                                    if (!subscribers[body.id])
                                        return; //we silently ignore this
                                    subscribers[body.id].complete();
                                }
                                else if (observableSubject) {
                                    observableSubject.complete();
                                }
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionObservableNext: {
                                const body = reply.parseBody(types.observableNextSchema);
                                if (observable) {
                                    if (!subscribers[body.id])
                                        return; //we silently ignore this
                                    subscribers[body.id].next(body.v);
                                }
                                else if (observableSubject) {
                                    observableSubject.next(body.v);
                                }
                                else {
                                    firstObservableNext = body.v;
                                    firstObservableNextCalled = true;
                                }
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionBehaviorSubject: {
                                const body = reply.parseBody(types.observableNextSchema);
                                observableSubject = new rxjs_1.BehaviorSubject(body.v);
                                resolve(observableSubject);
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionObservable: {
                                if (observable)
                                    console.error('Already got ActionResponseObservable');
                                const body = reply.parseBody(model_1.rpcResponseActionObservable);
                                //this observable can be subscribed multiple times now
                                // each time we need to call the server again, since its not a Subject
                                if (body.type === model_1.ActionObservableTypes.observable) {
                                    observable = new rxjs_1.Observable((observer) => {
                                        const id = subscriberId++;
                                        subscribers[id] = observer;
                                        subject.send(model_1.RpcTypes.ActionObservableSubscribe, model_1.rpcActionObservableSubscribeId, { id });
                                        return {
                                            unsubscribe: () => {
                                                delete subscribers[id];
                                                subject.send(model_1.RpcTypes.ActionObservableUnsubscribe, model_1.rpcActionObservableSubscribeId, { id });
                                            }
                                        };
                                    });
                                    observable.disconnect = () => {
                                        for (const sub of Object.values(subscribers)) {
                                            sub.complete();
                                        }
                                        subject.send(model_1.RpcTypes.ActionObservableDisconnect);
                                    };
                                    resolve(observable);
                                }
                                else if (body.type === model_1.ActionObservableTypes.subject) {
                                    observableSubject = new rxjs_1.Subject();
                                    //we have to monkey patch unsubscribe, because they is no other way to hook into that
                                    // note: subject.subscribe().add(T), T is not called when subject.unsubscribe() is called.
                                    observableSubject.unsubscribe = () => {
                                        rxjs_1.Subject.prototype.unsubscribe.call(observableSubject);
                                        subject.send(model_1.RpcTypes.ActionObservableSubjectUnsubscribe);
                                    };
                                    observableSubject.complete = () => {
                                        rxjs_1.Subject.prototype.complete.call(observableSubject);
                                        subject.send(model_1.RpcTypes.ActionObservableSubjectUnsubscribe);
                                    };
                                    if (firstObservableNextCalled) {
                                        observableSubject.next(firstObservableNext);
                                        firstObservableNext = undefined;
                                    }
                                    resolve(observableSubject);
                                }
                                else if (body.type === model_1.ActionObservableTypes.behaviorSubject) {
                                    observableSubject = new rxjs_1.BehaviorSubject(firstObservableNext);
                                    firstObservableNext = undefined;
                                    //we have to monkey patch unsubscribe, because they is no other way to hook into that
                                    // note: subject.subscribe().add(T), T is not called when subject.unsubscribe() is called.
                                    observableSubject.unsubscribe = () => {
                                        rxjs_1.Subject.prototype.unsubscribe.call(observableSubject);
                                        subject.send(model_1.RpcTypes.ActionObservableSubjectUnsubscribe);
                                    };
                                    observableSubject.complete = () => {
                                        rxjs_1.Subject.prototype.complete.call(observableSubject);
                                        subject.send(model_1.RpcTypes.ActionObservableSubjectUnsubscribe);
                                    };
                                    resolve(observableSubject);
                                }
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionCollectionChange: {
                                if (!collection)
                                    throw new Error('No collection loaded yet');
                                if (!types.collectionSchema)
                                    throw new Error('no collectionSchema loaded yet');
                                if (!collectionEntityStore)
                                    throw new Error('no collectionEntityStore loaded yet');
                                this.handleCollection(collectionEntityStore, types, collection, reply.getBodies());
                                break;
                            }
                            case model_1.RpcTypes.ResponseActionCollection: {
                                const bodies = reply.getBodies();
                                if (bodies[0].type === model_1.RpcTypes.ResponseActionReturnType) {
                                    setReturnType(types, bodies[0].parseBody(type_1.propertyDefinition));
                                }
                                const classType = types.resultProperty.getResolvedClassType();
                                collection = new collection_1.Collection(classType);
                                collectionEntityStore = this.entityState.getStore(classType);
                                collection.model.change.subscribe(() => {
                                    subject.send(model_1.RpcTypes.ActionCollectionModel, type_1.getClassSchema(collection_1.CollectionQueryModel), collection.model);
                                });
                                collection.addTeardown(() => {
                                    subject.send(model_1.RpcTypes.ActionCollectionUnsubscribe);
                                });
                                this.handleCollection(collectionEntityStore, types, collection, bodies);
                                resolve(collection);
                                break;
                            }
                            case model_1.RpcTypes.Error: {
                                subject.release();
                                const error = reply.getError();
                                // console.debug('Client received error', error);
                                reject(error);
                                break;
                            }
                            default: {
                                console.log(`Unexpected type received ${reply.type} ${model_1.RpcTypes[reply.type]}`);
                            }
                        }
                    }
                    catch (error) {
                        console.warn('reply error', reply.id, model_1.RpcTypes[reply.type], error);
                        reject(error);
                    }
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    handleCollection(entityStore, types, collection, messages) {
        for (const next of messages) {
            switch (next.type) {
                case model_1.RpcTypes.ResponseActionCollectionState: {
                    const state = next.parseBody(type_1.getClassSchema(collection_1.CollectionState));
                    collection.setState(state);
                    break;
                }
                case model_1.RpcTypes.ResponseActionCollectionSort: {
                    const body = next.parseBody(model_1.rpcResponseActionCollectionSort);
                    collection.setSort(body.ids);
                    break;
                }
                case model_1.RpcTypes.ResponseActionCollectionModel: {
                    collection.model.set(next.parseBody(type_1.getClassSchema(collection_1.CollectionQueryModel)));
                    break;
                }
                case model_1.RpcTypes.ResponseActionCollectionUpdate:
                case model_1.RpcTypes.ResponseActionCollectionAdd: {
                    if (!types.collectionSchema)
                        continue;
                    const incomingItems = next.parseBody(types.collectionSchema).v;
                    const items = [];
                    for (const item of incomingItems) {
                        if (!entityStore.isRegistered(item.id))
                            entityStore.register(item);
                        if (next.type === model_1.RpcTypes.ResponseActionCollectionUpdate) {
                            entityStore.onSet(item.id, item);
                        }
                        let fork = collection.entitySubjects.get(item.id);
                        if (!fork) {
                            fork = entityStore.createFork(item.id);
                            collection.entitySubjects.set(item.id, fork);
                        }
                        items.push(fork.value);
                        //fork is automatically unsubscribed once removed from the collection
                        fork.pipe(operators_1.skip(1)).subscribe(i => {
                            if (fork.deleted)
                                return; //we get deleted already
                            collection.deepChange.next(i);
                            collection.loaded();
                        });
                    }
                    if (next.type === model_1.RpcTypes.ResponseActionCollectionAdd) {
                        collection.add(items);
                    }
                    else if (next.type === model_1.RpcTypes.ResponseActionCollectionUpdate) {
                        collection.update(items);
                    }
                    break;
                }
                case model_1.RpcTypes.ResponseActionCollectionRemove: {
                    const ids = next.parseBody(model_1.rpcResponseActionCollectionRemove).ids;
                    collection.remove(ids); //this unsubscribes its EntitySubject as well
                    break;
                }
                case model_1.RpcTypes.ResponseActionCollectionSet: {
                    if (!types.collectionSchema)
                        continue;
                    const incomingItems = next.parseBody(types.collectionSchema).v;
                    const items = [];
                    for (const item of incomingItems) {
                        if (!entityStore.isRegistered(item.id))
                            entityStore.register(item);
                        const fork = entityStore.createFork(item.id);
                        collection.entitySubjects.set(item.id, fork);
                        items.push(fork.value);
                        //fork is automatically unsubscribed once removed from the collection
                        fork.pipe(operators_1.skip(1)).subscribe(i => {
                            if (fork.deleted)
                                return; //we get deleted already
                            collection.deepChange.next(i);
                            collection.loaded();
                        });
                    }
                    collection.set(items);
                    break;
                }
            }
        }
        collection.loaded();
    }
    async loadActionTypes(controller, method, options = {}) {
        const state = controller.getState(method);
        if (state.types)
            return state.types;
        const typeReuseDisabled = options ? options.typeReuseDisabled === true : false;
        if (state.promise) {
            return state.promise;
        }
        state.promise = core_1.asyncOperation(async (resolve, reject) => {
            try {
                const parsed = await this.client.sendMessage(model_1.RpcTypes.ActionType, model_1.rpcActionType, {
                    controller: controller.controller,
                    method: method,
                    disableTypeReuse: typeReuseDisabled
                }, {
                    peerId: controller.peerId,
                    dontWaitForConnection: options.dontWaitForConnection,
                    timeout: options.timeout,
                }).firstThenClose(model_1.RpcTypes.ResponseActionType, model_1.rpcResponseActionType);
                const parameters = [];
                const argsSchema = type_1.createClassSchema();
                for (const propertyJson of parsed.parameters) {
                    const property = type_1.PropertySchema.fromJSON(propertyJson);
                    argsSchema.registerProperty(property);
                    parameters.push(propertyJson.name);
                }
                const resultProperty = type_1.PropertySchema.fromJSON(parsed.result, undefined, !typeReuseDisabled);
                resultProperty.name = 'v';
                const resultSchema = type_1.createClassSchema();
                resultSchema.registerProperty(resultProperty);
                const observableNextSchema = model_1.rpcActionObservableSubscribeId.clone();
                if (parsed.next) {
                    observableNextSchema.registerProperty(type_1.PropertySchema.fromJSON(parsed.next, undefined, !typeReuseDisabled));
                }
                const collectionSchema = type_1.createClassSchema();
                const v = new type_1.PropertySchema('v');
                v.setType('array');
                v.templateArgs.push(resultProperty);
                collectionSchema.registerProperty(v);
                state.types = {
                    parameters: parameters,
                    parameterSchema: model_1.rpcAction.extend({ args: argsSchema }),
                    resultProperty,
                    resultSchema,
                    observableNextSchema,
                    collectionSchema,
                };
                resolve(state.types);
            }
            catch (error) {
                reject(error);
            }
        });
        try {
            return await state.promise;
        }
        catch (error) {
            state.promise = undefined;
            throw error;
        }
    }
}
exports.RpcActionClient = RpcActionClient;
//# sourceMappingURL=action.js.map