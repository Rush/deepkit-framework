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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
var ValidationError_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticationError = exports.rpcEntityPatch = exports.rpcEntityRemove = exports.rpcResponseActionCollectionSort = exports.rpcResponseActionCollectionRemove = exports.rpcPeerDeregister = exports.rpcPeerRegister = exports.rpcResponseActionType = exports.rpcActionType = exports.rpcAction = exports.rpcResponseAuthenticate = exports.rpcAuthenticate = exports.rpcResponseActionObservable = exports.rpcSort = exports.ActionObservableTypes = exports.rpcResponseActionObservableSubscriptionError = exports.rpcError = exports.rpcActionObservableSubscribeId = exports.rpcChunk = exports.rpcClientId = exports.RpcTypes = exports.ValidationParameterError = exports.ValidationError = exports.ValidationErrorItem = exports.JSONError = exports.ControllerSymbol = exports.ControllerDefinition = exports.EntitySubject = exports.isEntitySubject = exports.StreamBehaviorSubject = exports.ConnectionWriter = void 0;
const core_1 = require("@deepkit/core");
const core_rxjs_1 = require("@deepkit/core-rxjs");
const type_1 = require("@deepkit/type");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
class ConnectionWriter {
    write(buffer) {
    }
}
exports.ConnectionWriter = ConnectionWriter;
class StreamBehaviorSubject extends rxjs_1.BehaviorSubject {
    constructor(item, teardown) {
        super(item);
        this.appendSubject = new rxjs_1.Subject();
        this.nextOnAppend = false;
        this.unsubscribed = false;
        this.teardowns = [];
        if (teardown) {
            this.teardowns.push(teardown);
        }
    }
    isUnsubscribed() {
        return this.unsubscribed;
    }
    get nextStateChange() {
        if (!this.nextChange) {
            this.nextChange = new rxjs_1.Subject();
        }
        return this.nextChange.toPromise();
    }
    addTearDown(teardown) {
        if (this.unsubscribed) {
            core_rxjs_1.tearDown(teardown);
            return;
        }
        this.teardowns.push(teardown);
    }
    /**
     * This method differs to BehaviorSubject in the way that this does not throw an error
     * when the subject is closed/unsubscribed.
     */
    getValue() {
        if (this.hasError) {
            throw this.thrownError;
        }
        else {
            return this._value;
        }
    }
    next(value) {
        super.next(value);
        if (this.nextChange) {
            this.nextChange.complete();
            delete this.nextChange;
        }
    }
    activateNextOnAppend() {
        this.nextOnAppend = true;
    }
    toUTF8() {
        const subject = new StreamBehaviorSubject(this.value instanceof Uint8Array ? type_1.arrayBufferTo(this.value, 'utf8') : '');
        const sub1 = this.pipe(operators_1.skip(1)).subscribe(v => {
            subject.next(v instanceof Uint8Array ? type_1.arrayBufferTo(v, 'utf8') : '');
        });
        const sub2 = this.appendSubject.subscribe(v => {
            subject.append(v instanceof Uint8Array ? type_1.arrayBufferTo(v, 'utf8') : '');
        });
        subject.nextOnAppend = this.nextOnAppend;
        // const that = this;
        // Object.defineProperty(subject, 'nextStateChange', {
        //     get() {
        //         console.log('utf8 nextStateChange');
        //         return that.nextStateChange;
        //     }
        // });
        subject.addTearDown(() => {
            sub1.unsubscribe();
            sub2.unsubscribe();
            this.unsubscribe();
        });
        return subject;
    }
    append(value) {
        this.appendSubject.next(value);
        if (this.nextOnAppend) {
            if (value instanceof Uint8Array) {
                if (this.value instanceof Uint8Array) {
                    this.next(Buffer.concat([this.value, value]));
                }
                else {
                    this.next(value);
                }
            }
            else {
                this.next((this.getValue() + value));
            }
        }
        else {
            if ('string' === typeof value) {
                if (!this._value)
                    this._value = '';
                this._value = this._value + value;
            }
        }
    }
    unsubscribe() {
        if (this.unsubscribed)
            return;
        this.unsubscribed = true;
        for (const teardown of this.teardowns) {
            core_rxjs_1.tearDown(teardown);
        }
        super.unsubscribe();
    }
}
exports.StreamBehaviorSubject = StreamBehaviorSubject;
const IsEntitySubject = Symbol.for('deepkit/entitySubject');
function isEntitySubject(v) {
    return !!v && core_1.isObject(v) && v.hasOwnProperty(IsEntitySubject);
}
exports.isEntitySubject = isEntitySubject;
class EntitySubject extends StreamBehaviorSubject {
    constructor() {
        super(...arguments);
        /**
         * Patches are in class format.
         */
        this.patches = new rxjs_1.Subject();
        this.delete = new rxjs_1.Subject();
        this[_a] = true;
        this.deleted = false;
    }
    get id() {
        return this.value.id;
    }
    get onDeletion() {
        return new rxjs_1.Observable((observer) => {
            if (this.deleted) {
                observer.next();
                return;
            }
            const sub = this.delete.subscribe(() => {
                observer.next();
                sub.unsubscribe();
            });
            return {
                unsubscribe() {
                    sub.unsubscribe();
                }
            };
        });
    }
    next(value) {
        if (value === undefined) {
            this.deleted = true;
            this.delete.next(true);
            super.next(this.value);
            return;
        }
        super.next(value);
    }
}
exports.EntitySubject = EntitySubject;
_a = IsEntitySubject;
class ControllerDefinition {
    constructor(path, entities = []) {
        this.path = path;
        this.entities = entities;
    }
}
exports.ControllerDefinition = ControllerDefinition;
function ControllerSymbol(path, entities = []) {
    return new ControllerDefinition(path, entities);
}
exports.ControllerSymbol = ControllerSymbol;
let JSONError = class JSONError {
    constructor(json) {
        this.json = json;
    }
};
JSONError = __decorate([
    type_1.Entity('@error:json'),
    __param(0, type_1.t.any.name('json')),
    __metadata("design:paramtypes", [Object])
], JSONError);
exports.JSONError = JSONError;
let ValidationErrorItem = class ValidationErrorItem {
    constructor(path, code, message) {
        this.path = path;
        this.code = code;
        this.message = message;
    }
    toString() {
        return `${this.path}(${this.code}): ${this.message}`;
    }
};
ValidationErrorItem = __decorate([
    __param(0, type_1.t.name('path')),
    __param(1, type_1.t.name('code')),
    __param(2, type_1.t.name('message')),
    __metadata("design:paramtypes", [String, String, String])
], ValidationErrorItem);
exports.ValidationErrorItem = ValidationErrorItem;
let ValidationError = ValidationError_1 = class ValidationError extends core_1.CustomError {
    constructor(errors) {
        super(errors.map(v => `${v.path}(${v.code}): ${v.message}`).join(','));
        this.errors = errors;
    }
    static from(errors) {
        return new ValidationError_1(errors.map(v => new ValidationErrorItem(v.path, v.message, v.code || '')));
    }
};
ValidationError = ValidationError_1 = __decorate([
    type_1.Entity('@error:validation'),
    __param(0, type_1.t.array(ValidationErrorItem).name('errors')),
    __metadata("design:paramtypes", [Array])
], ValidationError);
exports.ValidationError = ValidationError;
let ValidationParameterError = class ValidationParameterError {
    constructor(controller, action, arg, errors) {
        this.controller = controller;
        this.action = action;
        this.arg = arg;
        this.errors = errors;
    }
    get message() {
        return this.errors.map(v => `${v.path}: ${v.message} (${v.code})`).join(',');
    }
};
ValidationParameterError = __decorate([
    type_1.Entity('@error:parameter'),
    __param(0, type_1.t.name('controller')),
    __param(1, type_1.t.name('action')),
    __param(2, type_1.t.name('arg')),
    __param(3, type_1.t.array(ValidationErrorItem).name('errors')),
    __metadata("design:paramtypes", [String, String, Number, Array])
], ValidationParameterError);
exports.ValidationParameterError = ValidationParameterError;
var RpcTypes;
(function (RpcTypes) {
    RpcTypes[RpcTypes["Ack"] = 0] = "Ack";
    RpcTypes[RpcTypes["Error"] = 1] = "Error";
    //A batched chunk. Used when a single message exceeds a certain size. It's split up in multiple packages, allowing to track progress,
    //cancel, and safe memory. Allows to send shorter messages between to not block the connection. Both ways.
    RpcTypes[RpcTypes["Chunk"] = 2] = "Chunk";
    RpcTypes[RpcTypes["ChunkAck"] = 3] = "ChunkAck";
    RpcTypes[RpcTypes["Ping"] = 4] = "Ping";
    RpcTypes[RpcTypes["Pong"] = 5] = "Pong";
    //client -> server
    RpcTypes[RpcTypes["Authenticate"] = 6] = "Authenticate";
    RpcTypes[RpcTypes["ActionType"] = 7] = "ActionType";
    RpcTypes[RpcTypes["Action"] = 8] = "Action";
    RpcTypes[RpcTypes["PeerRegister"] = 9] = "PeerRegister";
    RpcTypes[RpcTypes["PeerDeregister"] = 10] = "PeerDeregister";
    //server -> client
    RpcTypes[RpcTypes["ClientId"] = 11] = "ClientId";
    RpcTypes[RpcTypes["ClientIdResponse"] = 12] = "ClientIdResponse";
    RpcTypes[RpcTypes["AuthenticateResponse"] = 13] = "AuthenticateResponse";
    RpcTypes[RpcTypes["ResponseActionType"] = 14] = "ResponseActionType";
    RpcTypes[RpcTypes["ResponseActionReturnType"] = 15] = "ResponseActionReturnType";
    RpcTypes[RpcTypes["ResponseActionSimple"] = 16] = "ResponseActionSimple";
    RpcTypes[RpcTypes["ResponseActionResult"] = 17] = "ResponseActionResult";
    RpcTypes[RpcTypes["ActionObservableSubscribe"] = 18] = "ActionObservableSubscribe";
    RpcTypes[RpcTypes["ActionObservableUnsubscribe"] = 19] = "ActionObservableUnsubscribe";
    RpcTypes[RpcTypes["ActionObservableDisconnect"] = 20] = "ActionObservableDisconnect";
    RpcTypes[RpcTypes["ActionObservableSubjectUnsubscribe"] = 21] = "ActionObservableSubjectUnsubscribe";
    RpcTypes[RpcTypes["ResponseActionObservable"] = 22] = "ResponseActionObservable";
    RpcTypes[RpcTypes["ResponseActionBehaviorSubject"] = 23] = "ResponseActionBehaviorSubject";
    RpcTypes[RpcTypes["ResponseActionObservableNext"] = 24] = "ResponseActionObservableNext";
    RpcTypes[RpcTypes["ResponseActionObservableComplete"] = 25] = "ResponseActionObservableComplete";
    RpcTypes[RpcTypes["ResponseActionObservableError"] = 26] = "ResponseActionObservableError";
    RpcTypes[RpcTypes["ActionCollectionUnsubscribe"] = 27] = "ActionCollectionUnsubscribe";
    RpcTypes[RpcTypes["ActionCollectionModel"] = 28] = "ActionCollectionModel";
    RpcTypes[RpcTypes["ResponseActionCollection"] = 29] = "ResponseActionCollection";
    RpcTypes[RpcTypes["ResponseActionCollectionModel"] = 30] = "ResponseActionCollectionModel";
    RpcTypes[RpcTypes["ResponseActionCollectionSort"] = 31] = "ResponseActionCollectionSort";
    RpcTypes[RpcTypes["ResponseActionCollectionState"] = 32] = "ResponseActionCollectionState";
    RpcTypes[RpcTypes["ResponseActionCollectionChange"] = 33] = "ResponseActionCollectionChange";
    RpcTypes[RpcTypes["ResponseActionCollectionSet"] = 34] = "ResponseActionCollectionSet";
    RpcTypes[RpcTypes["ResponseActionCollectionAdd"] = 35] = "ResponseActionCollectionAdd";
    RpcTypes[RpcTypes["ResponseActionCollectionRemove"] = 36] = "ResponseActionCollectionRemove";
    RpcTypes[RpcTypes["ResponseActionCollectionUpdate"] = 37] = "ResponseActionCollectionUpdate";
    RpcTypes[RpcTypes["ResponseEntity"] = 38] = "ResponseEntity";
    RpcTypes[RpcTypes["Entity"] = 39] = "Entity";
    RpcTypes[RpcTypes["EntityPatch"] = 40] = "EntityPatch";
    RpcTypes[RpcTypes["EntityRemove"] = 41] = "EntityRemove";
})(RpcTypes = exports.RpcTypes || (exports.RpcTypes = {}));
exports.rpcClientId = type_1.t.schema({
    id: type_1.t.type(Uint8Array)
});
exports.rpcChunk = type_1.t.schema({
    id: type_1.t.number,
    total: type_1.t.number,
    v: type_1.t.type(Uint8Array),
});
exports.rpcActionObservableSubscribeId = type_1.t.schema({
    id: type_1.t.number,
});
exports.rpcError = type_1.t.schema({
    classType: type_1.t.string,
    message: type_1.t.string,
    stack: type_1.t.string,
    properties: type_1.t.map(type_1.t.any).optional,
});
exports.rpcResponseActionObservableSubscriptionError = exports.rpcError.extend({ id: type_1.t.number });
var ActionObservableTypes;
(function (ActionObservableTypes) {
    ActionObservableTypes[ActionObservableTypes["observable"] = 0] = "observable";
    ActionObservableTypes[ActionObservableTypes["subject"] = 1] = "subject";
    ActionObservableTypes[ActionObservableTypes["behaviorSubject"] = 2] = "behaviorSubject";
})(ActionObservableTypes = exports.ActionObservableTypes || (exports.ActionObservableTypes = {}));
exports.rpcSort = type_1.t.schema({
    field: type_1.t.string,
    direction: type_1.t.union('asc', 'desc'),
});
exports.rpcResponseActionObservable = type_1.t.schema({
    type: type_1.t.enum(ActionObservableTypes)
});
exports.rpcAuthenticate = type_1.t.schema({
    token: type_1.t.any,
});
exports.rpcResponseAuthenticate = type_1.t.schema({
    username: type_1.t.string,
});
exports.rpcAction = type_1.t.schema({
    controller: type_1.t.string,
    method: type_1.t.string,
});
exports.rpcActionType = type_1.t.schema({
    controller: type_1.t.string,
    method: type_1.t.string,
    disableTypeReuse: type_1.t.boolean.optional,
});
exports.rpcResponseActionType = type_1.t.schema({
    parameters: type_1.t.array(type_1.propertyDefinition),
    result: type_1.t.type(type_1.propertyDefinition),
    next: type_1.t.type(type_1.propertyDefinition).optional,
});
exports.rpcPeerRegister = type_1.t.schema({
    id: type_1.t.string,
});
exports.rpcPeerDeregister = type_1.t.schema({
    id: type_1.t.string,
});
exports.rpcResponseActionCollectionRemove = type_1.t.schema({
    ids: type_1.t.array(type_1.t.union(type_1.t.string, type_1.t.number)),
});
exports.rpcResponseActionCollectionSort = type_1.t.schema({
    ids: type_1.t.array(type_1.t.union(type_1.t.string, type_1.t.number)),
});
exports.rpcEntityRemove = type_1.t.schema({
    entityName: type_1.t.string,
    ids: type_1.t.array(type_1.t.union(type_1.t.string, type_1.t.number)),
});
exports.rpcEntityPatch = type_1.t.schema({
    entityName: type_1.t.string,
    id: type_1.t.union(type_1.t.string, type_1.t.number),
    version: type_1.t.number,
    patch: type_1.t.type({
        $set: type_1.t.map(type_1.t.any).optional,
        $unset: type_1.t.map(type_1.t.number).optional,
        $inc: type_1.t.map(type_1.t.number).optional,
    })
});
class AuthenticationError extends Error {
    constructor(message = 'Authentication failed') {
        super(message);
    }
}
exports.AuthenticationError = AuthenticationError;
//# sourceMappingURL=model.js.map