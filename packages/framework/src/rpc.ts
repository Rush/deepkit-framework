/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { BasicInjector, InjectorContext } from '@deepkit/injector';
import {
    rpcActionType,
    RpcConnectionWriter,
    RpcControllerAccess,
    RpcKernel,
    RpcKernelBaseConnection,
    RpcKernelConnection,
    RpcMessage,
    RpcMessageBuilder,
    RpcServerAction
} from '@deepkit/rpc';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';

export class RpcInjectorContext extends InjectorContext {
}

export class RpcServerActionWithStopwatch extends RpcServerAction {
    stopwatch?: Stopwatch;

    protected async hasControllerAccess(controllerAccess: RpcControllerAccess): Promise<boolean> {
        const frame = this.stopwatch ? this.stopwatch.start('RPC/controllerAccess') : undefined;

        try {
            return await super.hasControllerAccess(controllerAccess);
        } finally {
            if (frame) frame.end();
        }
    }

    async handleAction(message: RpcMessage, response: RpcMessageBuilder): Promise<void> {
        const body = message.parseBody(rpcActionType);
        const frame = this.stopwatch ? this.stopwatch.start(body.method + '() [' + body.controller + ']', FrameCategory.rpc, true) : undefined;
        if (frame) {
            const types = await this.loadTypes(body.controller, body.method);
            const value = message.parseBody(types.parameterSchema);
            frame.data({method: body.method, controller: body.controller, arguments: Object.values(value.args)});
        }

        try {
            if (frame) return await frame.run({}, () => super.handleAction(message, response));
            return await super.handleAction(message, response);
        } finally {
            if (frame) frame.end();
        }
    }
}

export class RpcKernelConnectionWithStopwatch extends RpcKernelConnection {
    protected actionHandler = new RpcServerActionWithStopwatch(this.controllers, this.injector, this.security, this.sessionState);
    stopwatch?: Stopwatch;

    setStopwatch(stopwatch: Stopwatch) {
        this.stopwatch = stopwatch;
        this.actionHandler.stopwatch = stopwatch;
    }

    protected async authenticate(message: RpcMessage, response: RpcMessageBuilder): Promise<void> {
        const frame = this.stopwatch ? this.stopwatch.start('RPC/authenticate', FrameCategory.rpcAuthenticate, true) : undefined;
        try {
            return await super.authenticate(message, response);
        } finally {
            if (frame) frame.end();
        }
    }
}

export class RpcKernelWithStopwatch extends RpcKernel {
    protected RpcKernelConnection = RpcKernelConnectionWithStopwatch;

    stopwatch?: Stopwatch;

    createConnection(writer: RpcConnectionWriter, injector?: BasicInjector): RpcKernelBaseConnection {
        const connection = super.createConnection(writer, injector);
        if (this.stopwatch) {
            (connection as RpcKernelConnectionWithStopwatch).setStopwatch(this.stopwatch);
        }
        return connection;
    }
}
