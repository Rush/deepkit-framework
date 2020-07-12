import {
    ClassSchema,
    createJITConverterFromPropertySchema,
    createXToClassFunction,
    getGlobalStore,
    PropertySchema
} from "@super-hornet/marshal";
import {DatabaseQueryModel} from "./query";
import {ClassType, getClassName} from "@super-hornet/core";
import {DatabaseSession} from "./database-session";
import {markItemAsKnownInDatabase} from "./entity-register";

/**
 * Returns true if item is hydrated. Returns false when its a unpopulated proxy.
 */
export function isHydrated(item: any) {
    return !!(item.__databaseSession);
}

export function setHydratedDatabaseSession(item: any, databaseSession: DatabaseSession<any>) {
    Object.defineProperty(item, '__databaseSession', {
        enumerable: false,
        configurable: false,
        writable: true,
        value: databaseSession,
    });
}

export function markAsHydrated(item: any) {
    item.__databaseSession = undefined;
}

export function getHydratedDatabaseSession(item: any) {
    return item.__databaseSession;
}

export class Formatter {
    //todo: move this to database level
    protected proxyClasses: Map<ClassType<any>, ClassType<any>> = new Map();

    protected instancePools: Map<ClassType<any>, Map<any, any>> = new Map();

    public withEntityTracking: boolean = true;

    constructor(
        protected session: DatabaseSession<any>,
        protected serializerSourceName: string,
    ) {
    }

    protected getInstancePoolForClass(classType: ClassType<any>): Map<any, any> {
        if (!this.instancePools.has(classType)) {
            this.instancePools.set(classType, new Map());
        }

        return this.instancePools.get(classType)!;
    }

    public hydrate<T>(classSchema: ClassSchema<T>, model: DatabaseQueryModel<T, any, any>, value: any): any {
        this.withEntityTracking = model.withEntityTracking && !model.isPartial();
        return this.hydrateModel(model, classSchema, value);
    }

    protected isEntityTrackingEnabled() {
        return this.session.withEntityTracking && this.withEntityTracking;
    }

    protected makeInvalidReference(item: any, propertySchema: PropertySchema) {
        const storeName = '$__' + propertySchema.name;
        Object.defineProperty(item, storeName, {
            enumerable: false,
            configurable: false,
            writable: true,
            value: undefined
        });

        Object.defineProperty(item, propertySchema.name, {
            enumerable: false,
            configurable: false,
            get() {
                if ('undefined' !== typeof this[storeName]) {
                    return this[storeName];
                }
                if (getGlobalStore().unpopulatedCheckActive) {
                    throw new Error(`Reference ${propertySchema.name} was not populated. Use joinWith(), useJoinWith(), etc to populate the reference.`);
                }
            },
            set(v: any) {
                this[storeName] = v;
            }
        });
    }

    protected getProxyClass<T>(classSchema: ClassSchema<T>): ClassType<T> {
        if (!this.proxyClasses.has(classSchema.classType)) {
            const type = classSchema.classType as any;

            //note: this is necessary to give the anonymous class the same name when using toString().
            const temp: any = {};
            temp.Proxy = class extends type {
            };
            const Proxy = temp.Proxy;

            setHydratedDatabaseSession(Proxy.prototype, this.session);

            for (const propName of classSchema.propertyNames) {
                if (propName === classSchema.idField) continue;

                Object.defineProperty(Proxy.prototype, propName, {
                    enumerable: false,
                    configurable: true,
                    get() {
                        if (getGlobalStore().unpopulatedCheckActive) {
                            throw new Error(`Reference ${getClassName(classSchema.classType)} was not completely populated (only primary keys). Use joinWith(), useJoinWith(), etc to populate the reference.`);
                        }
                    },
                    set() {
                        if (getGlobalStore().unpopulatedCheckActive) {
                            throw new Error(`Reference ${getClassName(classSchema.classType)} was not completely populated (only primary keys). Use joinWith(), useJoinWith(), etc to populate the reference.`);
                        }
                    }
                });
            }
            this.proxyClasses.set(classSchema.classType, Proxy);
        }

        return this.proxyClasses.get(classSchema.classType)!;
    }

    protected setProxyClass(
        classSchema: ClassSchema,
        converted: any,
        dbItem: any,
        propertySchema: PropertySchema,
        isPartial: boolean
    ): void {
        if (undefined === dbItem[propertySchema.getForeignKeyName()]) {
            if (propertySchema.isOptional) return;
            throw new Error(`Foreign key for ${propertySchema.name} is not projected.`);
        }

        const foreignSchema = propertySchema.getResolvedClassSchema();
        const fkn = propertySchema.getForeignKeyName();

        if (undefined === dbItem[fkn] || null === dbItem[fkn]) {
            //nothing to do when we got no item.
            return;
        }

        // const pk = propertyMongoToClass(classSchema.classType, fkn, dbItem[fkn]);
        const pk = createJITConverterFromPropertySchema(this.serializerSourceName, 'class', classSchema.getProperty(fkn))(dbItem[fkn]);

        const pool = this.getInstancePoolForClass(foreignSchema.classType);

        if (!isPartial) {
            if (this.isEntityTrackingEnabled()) {
                const item = this.session.entityRegistry.get(foreignSchema, pk);
                if (item) {
                    converted[propertySchema.name] = item;
                    return;
                }
            }
            if (pool.has(pk)) {
                converted[propertySchema.name] = pool.get(pk);
                return;
            }
        }

        const args: any[] = [];

        for (const prop of foreignSchema.getMethodProperties('constructor')) {
            args.push(
                dbItem[prop.name] !== undefined && dbItem[prop.name] !== null
                    ? createJITConverterFromPropertySchema(this.serializerSourceName, 'class', classSchema.getProperty(prop.name))(dbItem[prop.name])
                    : dbItem[prop.name]
            );
        }

        getGlobalStore().unpopulatedCheckActive = false;
        const ref = new (this.getProxyClass(foreignSchema))(...args);
        ref[foreignSchema.getPrimaryField().name] = pk;
        converted[propertySchema.name] = ref;
        getGlobalStore().unpopulatedCheckActive = true;

        if (!isPartial) {
            markItemAsKnownInDatabase(classSchema, ref);
            pool.set(pk, ref);
        }

        if (this.isEntityTrackingEnabled() && !isPartial) {
            this.session.entityRegistry.store(foreignSchema, ref);
        }
    }

    protected hydrateModel(model: DatabaseQueryModel<any, any, any>, classSchema: ClassSchema, value: any) {
        const primary = classSchema.getPrimaryField();
        const pk = createJITConverterFromPropertySchema(this.serializerSourceName, 'class', classSchema.getProperty(primary.name))(value[primary.name]);
        // const pk = propertyMongoToClass(classSchema.classType, primary.name, value[primary.name]);

        const pool = this.getInstancePoolForClass(classSchema.classType);

        if (pool.has(pk)) {
            return pool.get(pk);
        }

        if (this.isEntityTrackingEnabled() && !model.isPartial()) {
            const item = this.session.entityRegistry.get(classSchema, pk);

            if (item) {
                //if proxy or is stale
                if (!isHydrated(item)) {
                    //we automatically hydrate proxy object once someone fetches them from the database.
                    //or we update a stale instance
                    const newItem = this.createObject(model, classSchema, value);

                    for (const propName of classSchema.propertyNames) {
                        if (propName === classSchema.idField) continue;

                        const prop = classSchema.classProperties.get(propName)!;
                        if (prop.isReference || prop.backReference) continue;

                        Object.defineProperty(item, propName, {
                            enumerable: true,
                            configurable: true,
                            value: newItem[propName],
                        });
                    }

                    //check if we got new reference data we can apply to the instance
                    for (const join of model.joins) {
                        if (join.populate) {
                            const refName = join.as || join.propertySchema.name;
                            if (value[refName] !== undefined && value[refName] !== null) {
                                if (join.propertySchema.backReference) {
                                    Object.defineProperty(item, join.propertySchema.name, {
                                        enumerable: true,
                                        configurable: true,
                                        value: value[refName].map((item: any) => {
                                            return this.hydrateModel(join.query.model, join.propertySchema.getResolvedClassSchema(), item);
                                        }),
                                    });
                                } else {
                                    Object.defineProperty(item, join.propertySchema.name, {
                                        enumerable: true,
                                        configurable: true,
                                        value: this.hydrateModel(
                                            join.query.model, join.propertySchema.getResolvedClassSchema(), value[refName]
                                        ),
                                    });
                                }
                            }
                        }
                    }

                    markAsHydrated(item);
                }

                return item;
            }
        }

        const converted = this.createObject(model, classSchema, value);

        if (!model.isPartial()) {
            markItemAsKnownInDatabase(classSchema, converted);
            pool.set(pk, converted);

            if (this.isEntityTrackingEnabled()) {
                this.session.entityRegistry.store(classSchema, converted);
            }
        }

        return converted;
    }

    protected createObject(model: DatabaseQueryModel<any, any, any>, classSchema: ClassSchema, value: any) {
        const converted = createXToClassFunction(classSchema.classType, this.serializerSourceName)(value);

        const handledRelation: { [name: string]: true } = {};

        for (const join of model.joins) {
            handledRelation[join.propertySchema.name] = true;
            const refName = join.as || join.propertySchema.name;

            if (join.populate) {
                const hasValue = value[refName] !== undefined && value[refName] !== null;
                if (join.propertySchema.backReference && join.propertySchema.isArray) {
                    if (hasValue) {
                        converted[join.propertySchema.name] = value[refName].map((item: any) => {
                            return this.hydrateModel(join.query.model, join.propertySchema.getResolvedClassSchema(), item);
                        });
                    } else {
                        converted[join.propertySchema.name] = [];
                    }
                } else if (hasValue) {
                    converted[join.propertySchema.name] = this.hydrateModel(
                        join.query.model, join.propertySchema.getResolvedClassSchema(), value[refName]
                    );
                } else {
                    converted[join.propertySchema.name] = undefined;
                }
            } else {
                //not populated
                if (join.propertySchema.isReference) {
                    this.setProxyClass(classSchema, converted, value, join.propertySchema, model.isPartial());
                } else {
                    //unpopulated backReferences are inaccessible
                    if (!model.isPartial()) {
                        this.makeInvalidReference(converted, join.propertySchema);
                    }
                }
            }
        }

        //all non-populated relations will be
        for (const propertySchema of classSchema.references.values()) {
            if (handledRelation[propertySchema.name]) continue;
            if (propertySchema.isReference) {
                this.setProxyClass(classSchema, converted, value, propertySchema, model.isPartial());
            } else {
                //unpopulated backReferences are inaccessible
                if (!model.isPartial()) {
                    this.makeInvalidReference(converted, propertySchema);
                }
            }
        }

        return converted;
    }
}