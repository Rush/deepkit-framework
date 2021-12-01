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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.Collection = exports.isCollection = exports.CollectionState = exports.CollectionQueryModel = void 0;
/**
 * This is a collection object that contains items of an certain entity.
 * This collection "lives" in the sense that its items are automatically
 * updated, added and removed. When such a change happens, an event is triggered* you can listen on.
 */
const core_1 = require("@deepkit/core");
const core_rxjs_1 = require("@deepkit/core-rxjs");
const type_1 = require("@deepkit/type");
const rxjs_1 = require("rxjs");
/**
 * internal note: This is aligned with @deepit/orm `DatabaseQueryModel`
 */
class CollectionQueryModel {
    constructor() {
        this.itemsPerPage = 50;
        this.parameters = {};
        this.change = new rxjs_1.Subject();
    }
    set(model) {
        this.filter = model.filter;
        this.skip = model.skip;
        this.itemsPerPage = model.itemsPerPage || 50;
        this.limit = model.limit;
        this.sort = model.sort;
        for (const [i, v] of Object.entries(model.parameters)) {
            this.parameters[i] = v;
        }
    }
    changed() {
        this.change.next();
    }
    hasSort() {
        return this.sort !== undefined;
    }
    /**
     * Whether limit/skip is activated.
     */
    hasPaging() {
        return this.limit !== undefined || this.skip !== undefined;
    }
}
__decorate([
    type_1.t.map(type_1.t.any).optional,
    __metadata("design:type", Object)
], CollectionQueryModel.prototype, "filter", void 0);
__decorate([
    type_1.t.number.optional,
    __metadata("design:type", Number)
], CollectionQueryModel.prototype, "skip", void 0);
__decorate([
    type_1.t.number,
    __metadata("design:type", Number)
], CollectionQueryModel.prototype, "itemsPerPage", void 0);
__decorate([
    type_1.t.number.optional,
    __metadata("design:type", Number)
], CollectionQueryModel.prototype, "limit", void 0);
__decorate([
    type_1.t.map(type_1.t.any),
    __metadata("design:type", Object)
], CollectionQueryModel.prototype, "parameters", void 0);
__decorate([
    type_1.t.map(type_1.t.any).optional,
    __metadata("design:type", Object)
], CollectionQueryModel.prototype, "sort", void 0);
exports.CollectionQueryModel = CollectionQueryModel;
class CollectionState {
    constructor() {
        /**
         * Total count in the database for the current query, regardless of paging (skip/limit) count.
         *
         * Use count() to get the items count on the current page (which is equal to all().length)
         */
        this.total = 0;
    }
}
__decorate([
    type_1.t,
    __metadata("design:type", Number)
], CollectionState.prototype, "total", void 0);
exports.CollectionState = CollectionState;
const IsCollection = Symbol.for('deepkit/collection');
function isCollection(v) {
    return !!v && core_1.isObject(v) && v.hasOwnProperty(IsCollection);
}
exports.isCollection = isCollection;
class Collection extends rxjs_1.ReplaySubject {
    constructor(classType) {
        super(1);
        this.classType = classType;
        this.event = new rxjs_1.Subject;
        this.removed = new rxjs_1.Subject();
        this.added = new rxjs_1.Subject();
        this[_a] = true;
        this.teardowns = [];
        this.items = [];
        this.itemsMap = new Map();
        this.state = new CollectionState();
        this.deepChange = new rxjs_1.Subject();
        this.model = new CollectionQueryModel();
        this.entitySubjects = new Map();
    }
    getTotal() {
        return this.state.total;
    }
    getItemsPerPage() {
        return this.model.itemsPerPage;
    }
    getPages() {
        return Math.ceil(this.getTotal() / this.getItemsPerPage());
    }
    getSort() {
        return this.model.sort;
    }
    getParameter(name) {
        return this.model.parameters[name];
    }
    setParameter(name, value) {
        this.model.parameters[name] = value;
        return this;
    }
    orderByField(name, order = 'asc') {
        this.model.sort = { [name]: order };
        return this;
    }
    setPage(page) {
        this.model.skip = this.getItemsPerPage() * (page - 1);
        return this;
    }
    getPage() {
        return Math.floor((this.model.skip || 0) / this.getItemsPerPage()) + 1;
    }
    apply() {
        this.model.changed();
        return this.nextStateChange;
    }
    getEntitySubject(idOrItem) {
        const id = idOrItem instanceof this.classType ? idOrItem.id : idOrItem;
        return this.entitySubjects.get(id);
    }
    has(id) {
        return this.itemsMap.has(id);
    }
    get(id) {
        return this.itemsMap.get(id);
    }
    setState(state) {
        this.state = state;
        this.event.next({ type: 'state', state });
    }
    setSort(ids) {
        this.items.splice(0, this.items.length);
        for (const id of ids) {
            const item = this.itemsMap.get(id);
            if (item)
                this.items.push(item);
        }
        this.event.next({ type: 'sort', ids: ids });
        this.loaded();
    }
    /**
     * Resolves when next change happened.
     */
    get nextStateChange() {
        if (!this.nextChange) {
            this.nextChange = new Promise((resolve) => {
                this.nextChangeResolver = resolve;
            });
        }
        return this.nextChange;
    }
    unsubscribe() {
        super.unsubscribe();
        for (const teardown of this.teardowns)
            core_rxjs_1.tearDown(teardown);
        for (const subject of this.entitySubjects.values()) {
            subject.unsubscribe();
        }
        this.teardowns.length = 0;
    }
    addTeardown(teardown) {
        this.teardowns.push(teardown);
    }
    index(item) {
        return this.items.indexOf(item);
    }
    /**
     * Returns the page zero-based of the current item.
     */
    getPageOf(item, itemsPerPage = 10) {
        const index = this.index(item);
        if (-1 === index)
            return 0;
        return Math.floor(index / itemsPerPage);
    }
    reset() {
        this.items = [];
        this.entitySubjects.clear();
        this.itemsMap.clear();
    }
    all() {
        return this.items;
    }
    /**
     * Count of current page if paging is used, otherwise total count.
     */
    count() {
        return this.items.length;
    }
    ids() {
        const ids = [];
        for (const i of this.items) {
            ids.push(i.id);
        }
        return ids;
    }
    empty() {
        return 0 === this.items.length;
    }
    /**
     * All items from id -> value map.
     */
    map() {
        return this.itemsMap;
    }
    loaded() {
        if (this.isStopped) {
            throw new Error('Collection already unsubscribed');
        }
        this.next(this.items);
        if (this.nextChangeResolver) {
            this.nextChangeResolver();
            this.nextChangeResolver = undefined;
            this.nextChange = undefined;
        }
    }
    set(items, withEvent = true) {
        for (const item of items) {
            if (!this.itemsMap.has(item.id)) {
                this.added.next(item);
            }
            this.itemsMap.delete(item.id);
        }
        //remaining items will be deleted
        for (const deleted of this.itemsMap.values()) {
            this.removed.next(deleted);
            const subject = this.entitySubjects.get(deleted.id);
            if (subject) {
                subject.unsubscribe();
                this.entitySubjects.delete(deleted.id);
            }
        }
        this.itemsMap.clear();
        this.items = items;
        for (const item of items) {
            this.itemsMap.set(item.id, item);
        }
        if (withEvent) {
            this.event.next({ type: 'set', items: items });
        }
    }
    removeMany(ids, withEvent = true) {
        for (const id of ids) {
            const item = this.itemsMap.get(id);
            this.itemsMap.delete(id);
            if (item) {
                const index = this.items.indexOf(item);
                if (-1 !== index) {
                    this.removed.next(this.items[index]);
                    this.items.splice(index, 1);
                }
            }
            const subject = this.entitySubjects.get(id);
            if (subject) {
                subject.unsubscribe();
                this.entitySubjects.delete(id);
            }
        }
        if (withEvent) {
            this.event.next({ type: 'remove', ids: ids });
        }
    }
    update(items, withEvent = true) {
        items = core_1.isArray(items) ? items : [items];
        for (const item of items) {
            if (this.itemsMap.has(item.id)) {
                const index = this.items.indexOf(this.itemsMap.get(item.id));
                this.items[index] = item;
                this.itemsMap.set(item.id, item);
            }
            else {
                this.items.push(item);
                this.itemsMap.set(item.id, item);
            }
        }
        if (withEvent) {
            this.event.next({ type: 'update', items });
        }
    }
    add(items, withEvent = true) {
        if (!items) {
            throw new Error(`Trying to insert a ${core_1.getClassName(this.classType)} collection item without value`);
        }
        items = core_1.isArray(items) ? items : [items];
        for (const item of items) {
            this.added.next(item);
            if (this.itemsMap.has(item.id)) {
                const index = this.items.indexOf(this.itemsMap.get(item.id));
                this.items[index] = item;
                this.itemsMap.set(item.id, item);
            }
            else {
                this.items.push(item);
                this.itemsMap.set(item.id, item);
            }
        }
        if (withEvent) {
            this.event.next({ type: 'add', items });
        }
    }
    remove(ids, withEvent = true) {
        ids = core_1.isArray(ids) ? ids : [ids];
        for (const id of ids) {
            const item = this.itemsMap.get(id);
            if (!item)
                continue;
            this.itemsMap.delete(id);
            const fork = this.entitySubjects.get(id);
            fork === null || fork === void 0 ? void 0 : fork.unsubscribe();
            this.entitySubjects.delete(id);
            const index = this.items.indexOf(item);
            if (-1 !== index) {
                this.items.splice(index, 1);
            }
            if (withEvent) {
                this.removed.next(item);
            }
        }
        if (withEvent) {
            this.event.next({ type: 'remove', ids: ids });
        }
    }
}
exports.Collection = Collection;
_a = IsCollection;
//# sourceMappingURL=collection.js.map