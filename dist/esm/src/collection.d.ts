/**
 * This is a collection object that contains items of an certain entity.
 * This collection "lives" in the sense that its items are automatically
 * updated, added and removed. When such a change happens, an event is triggered* you can listen on.
 */
import { ClassType } from '@deepkit/core';
import { ReplaySubject, Subject, TeardownLogic } from 'rxjs';
import { EntitySubject, IdInterface } from './model';
export declare type FilterParameters = {
    [name: string]: any | undefined;
};
export declare type QuerySelector<T> = {
    $eq?: T;
    $gt?: T;
    $gte?: T;
    $in?: T[];
    $lt?: T;
    $lte?: T;
    $ne?: T;
    $nin?: T[];
    $not?: T extends string ? (QuerySelector<T> | RegExp) : QuerySelector<T>;
    $regex?: T extends string ? (RegExp | string) : never;
    $parameter?: string;
};
export declare type RootQuerySelector<T> = {
    $and?: Array<FilterQuery<T>>;
    $nor?: Array<FilterQuery<T>>;
    $or?: Array<FilterQuery<T>>;
    [key: string]: any;
};
declare type RegExpForString<T> = T extends string ? (RegExp | T) : T;
declare type MongoAltQuery<T> = T extends Array<infer U> ? (T | RegExpForString<U>) : RegExpForString<T>;
export declare type Condition<T> = MongoAltQuery<T> | QuerySelector<MongoAltQuery<T>>;
export declare type FilterQuery<T> = {
    [P in keyof T & string]?: Condition<T[P]>;
} & RootQuerySelector<T>;
export declare type SORT_ORDER = 'asc' | 'desc' | any;
export declare type Sort<T, ORDER extends SORT_ORDER = SORT_ORDER> = {
    [P in keyof T & string]?: ORDER;
};
export interface CollectionEventAdd<T> {
    type: 'add';
    items: T[];
}
export interface CollectionEventState {
    type: 'state';
    state: CollectionState;
}
export interface CollectionEventRemove {
    type: 'remove';
    ids: (string | number)[];
}
export interface CollectionEventSet {
    type: 'set';
    items: any[];
}
export interface CollectionEventUpdate {
    type: 'update';
    items: any[];
}
export interface CollectionSetSort {
    type: 'sort';
    ids: (string | number)[];
}
export declare type CollectionEvent<T> = CollectionEventAdd<T> | CollectionEventRemove | CollectionEventSet | CollectionEventState | CollectionEventUpdate | CollectionSetSort;
export declare type CollectionSortDirection = 'asc' | 'desc';
export interface CollectionSort {
    field: string;
    direction: CollectionSortDirection;
}
export interface CollectionEntitySubjectFetcher {
    fetch<T extends IdInterface>(classType: ClassType<T>, id: string | number): EntitySubject<T>;
}
export interface CollectionQueryModelInterface<T> {
    filter?: FilterQuery<T>;
    skip?: number;
    itemsPerPage: number;
    limit?: number;
    parameters: {
        [name: string]: any;
    };
    sort?: Sort<T>;
}
/**
 * internal note: This is aligned with @deepit/orm `DatabaseQueryModel`
 */
export declare class CollectionQueryModel<T> implements CollectionQueryModelInterface<T> {
    filter?: FilterQuery<T>;
    skip?: number;
    itemsPerPage: number;
    limit?: number;
    parameters: {
        [name: string]: any;
    };
    sort?: Sort<T>;
    readonly change: Subject<void>;
    set(model: CollectionQueryModelInterface<any>): void;
    changed(): void;
    hasSort(): boolean;
    /**
     * Whether limit/skip is activated.
     */
    hasPaging(): boolean;
}
export declare class CollectionState {
    /**
     * Total count in the database for the current query, regardless of paging (skip/limit) count.
     *
     * Use count() to get the items count on the current page (which is equal to all().length)
     */
    total: number;
}
declare const IsCollection: unique symbol;
export declare function isCollection(v: any): v is Collection<any>;
export declare class Collection<T extends IdInterface> extends ReplaySubject<T[]> {
    readonly classType: ClassType<T>;
    readonly event: Subject<CollectionEvent<T>>;
    readonly removed: Subject<T>;
    readonly added: Subject<T>;
    [IsCollection]: boolean;
    protected readonly teardowns: TeardownLogic[];
    protected items: T[];
    protected itemsMap: Map<string | number, T>;
    state: CollectionState;
    readonly deepChange: Subject<T>;
    protected nextChange?: Promise<void>;
    protected nextChangeResolver?: () => void;
    protected entitySubjectFetcher?: CollectionEntitySubjectFetcher;
    model: CollectionQueryModel<T>;
    readonly entitySubjects: Map<string | number, EntitySubject<T>>;
    constructor(classType: ClassType<T>);
    getTotal(): number;
    getItemsPerPage(): number;
    getPages(): number;
    getSort(): Sort<T, any> | undefined;
    getParameter(name: string): any;
    setParameter(name: string, value: any): this;
    orderByField(name: keyof T & string, order?: SORT_ORDER): this;
    setPage(page: number): this;
    getPage(): number;
    apply(): Promise<void>;
    getEntitySubject(idOrItem: string | number | T): EntitySubject<T> | undefined;
    has(id: string | number): boolean;
    get(id: string | number): T | undefined;
    setState(state: CollectionState): void;
    setSort(ids: (string | number)[]): void;
    /**
     * Resolves when next change happened.
     */
    get nextStateChange(): Promise<void>;
    unsubscribe(): void;
    addTeardown(teardown: TeardownLogic): void;
    index(item: T): number;
    /**
     * Returns the page zero-based of the current item.
     */
    getPageOf(item: T, itemsPerPage?: number): number;
    reset(): void;
    all(): T[];
    /**
     * Count of current page if paging is used, otherwise total count.
     */
    count(): number;
    ids(): (string | number)[];
    empty(): boolean;
    /**
     * All items from id -> value map.
     */
    map(): Map<string | number, T>;
    loaded(): void;
    set(items: T[], withEvent?: boolean): void;
    removeMany(ids: (string | number)[], withEvent?: boolean): void;
    update(items: T | T[], withEvent?: boolean): void;
    add(items: T | T[], withEvent?: boolean): void;
    remove(ids: (string | number) | (string | number)[], withEvent?: boolean): void;
}
export {};
