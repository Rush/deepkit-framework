/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { ClassType, toFastProperties } from '@deepkit/core';
import { ClassSchema, ExtractClassType, getClassSchema, t } from '@deepkit/type';
import { BaseResponse, Command } from './command';

const aggregateSchema = t.schema({
    aggregate: t.string,
    $db: t.string,
    pipeline: t.array(t.any),
    cursor: {
        batchSize: t.number,
    },
    lsid: t.type({id: t.uuid}).optional,
    txnNumber: t.number.optional,
    startTransaction: t.boolean.optional,
    autocommit: t.boolean.optional,
});

export class AggregateCommand<T extends ClassSchema | ClassType, R extends ClassSchema> extends Command {
    partial: boolean = false;

    constructor(
        public classSchema: T,
        public pipeline: any[] = [],
        public resultSchema?: R,
    ) {
        super();
    }

    async execute(config, host, transaction): Promise<ExtractClassType<R extends undefined ? T : R>[]> {
        const schema = getClassSchema(this.classSchema);

        const cmd = {
            aggregate: schema.collectionName || schema.name || 'unknown',
            $db: schema.databaseSchemaName || config.defaultDb || 'admin',
            pipeline: this.pipeline,
            cursor: {
                batchSize: 20000,
            }
        };

        if (transaction) transaction.applyTransaction(cmd);
        const resultSchema = this.resultSchema || schema;

        const jit = resultSchema.jit;
        let specialisedResponse = this.partial ? jit.mdbAggregatePartial : jit.mdbAggregate;
        if (!specialisedResponse) {
            if (this.partial) {
                specialisedResponse = t.extendSchema(BaseResponse, {
                    cursor: {
                        id: t.number,
                        firstBatch: t.array(t.partial(resultSchema)),
                        nextBatch: t.array(t.partial(resultSchema)),
                    },
                });
                jit.mdbAggregatePartial = specialisedResponse;
            } else {
                specialisedResponse = t.extendSchema(BaseResponse, {
                    cursor: {
                        id: t.number,
                        firstBatch: t.array(resultSchema),
                        nextBatch: t.array(resultSchema),
                    },
                });
                jit.mdbAggregate = specialisedResponse;
            }
            toFastProperties(jit);
        }

        const res = await this.sendAndWait(aggregateSchema, cmd, specialisedResponse) as { cursor: { id: BigInt, firstBatch: any[], nextBatch: any[] } };

        //todo: implement fetchMore
        return res.cursor.firstBatch;
    }

    needsWritableHost(): boolean {
        return false;
    }
}
