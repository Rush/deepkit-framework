/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */

import { asyncOperation, CustomError, getClassName } from '@deepkit/core';
import { getClassTypeFromInstance, getPropertyClassToXFunction, isClassInstance, isRegisteredEntity, jsonSerializer, ValidationFailed } from '@deepkit/type';
import { OutgoingHttpHeaders, ServerResponse } from 'http';
import { eventDispatcher } from '@deepkit/event';
import { HttpRequest, HttpResponse } from './model';
import { inject, injectable, InjectorContext } from '@deepkit/injector';
import { Logger } from '@deepkit/logger';
import { RouteConfig, RouteParameterResolverForInjector, Router } from './router';
import { createWorkflow, WorkflowEvent } from '@deepkit/workflow';
import type { ElementStruct, render } from '@deepkit/template';
import { FrameCategory, Stopwatch } from '@deepkit/stopwatch';

export function isElementStruct(v: any): v is ElementStruct {
    return 'object' === typeof v && v.hasOwnProperty('render') && v.hasOwnProperty('attributes') && !v.slice;
}

let templateRender: typeof render;

function getTemplateRender(): typeof render {
    if (!templateRender) {
        const template = require('@deepkit/template');
        templateRender = template.render;
    }

    return templateRender;
}

export class Redirect {
    public routeName?: string;
    public routeParameters?: { [name: string]: any };
    public url?: string;

    constructor(
        public statusCode: number = 302,
    ) {
    }

    static toRoute(routeName: string, parameters: { [name: string]: any } = {}, statusCode: number = 302): Redirect {
        const redirect = new Redirect(statusCode);
        redirect.routeName = routeName;
        redirect.routeParameters = parameters;
        return redirect;
    }

    static toUrl(url: string, statusCode: number = 302): Redirect {
        const redirect = new Redirect(statusCode);
        redirect.url = url;
        return redirect;
    }
}

export interface HttpError<T> {
    new(...args: any[]): Error;

    getHttpCode(): T;
}

export function HttpError<T extends number>(code: T, defaultMessage: string = ''): HttpError<T> {
    return class extends CustomError {
        constructor(message: string = defaultMessage) {
            super(message);
        }

        static getHttpCode() {
            return code;
        }
    };
}

export class HttpNotFoundError extends HttpError(404, 'Not found') {
}

export class HttpBadRequestError extends HttpError(400, 'Bad request') {
}

export class HttpAccessDeniedError extends HttpError(403, 'Access denied') {
}

export class HttpWorkflowEvent {
    stopped = false;

    stopPropagation() {
        this.stopped = true;
    }

    isStopped() {
        return this.stopped;
    }

    public nextState?: any;
    public nextStateEvent?: any;

    clearNext() {
        this.nextState = undefined;
        this.nextStateEvent = undefined;
    }

    /**
     * @see WorkflowNextEvent.next
     */
    next(nextState: string, event?: any) {
        this.nextState = nextState;
        this.nextStateEvent = event;
    }

    /**
     * Whether already a next workflow state has been scheduled.
     */
    hasNext(): boolean {
        return this.nextState !== undefined;
    }

    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
    ) {
    }

    get url() {
        return this.request.url || '/';
    }

    /**
     * Whether a response has already been sent.
     */
    get sent() {
        return this.response.headersSent;
    }

    send(response: any) {
        this.next('response', new HttpResponseEvent(this.injectorContext, this.request, this.response, response));
    }
}

export const HttpRequestEvent = HttpWorkflowEvent;
export const HttpRouteNotFoundEvent = HttpWorkflowEvent;

export class HttpWorkflowEventWithRoute extends HttpWorkflowEvent {
    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public route: RouteConfig,
    ) {
        super(injectorContext, request, response);
    }

    send(response: any) {
        this.next('response', new HttpResponseEvent(this.injectorContext, this.request, this.response, response, this.route));
    }

    accessDenied() {
        this.next('accessDenied', new HttpAccessDeniedEvent(this.injectorContext, this.request, this.response, this.route));
    }
}

export class HttpRouteEvent extends HttpWorkflowEvent {
    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public parameterResolver?: RouteParameterResolverForInjector,
        public route?: RouteConfig,
    ) {
        super(injectorContext, request, response);
    }

    routeFound(route: RouteConfig, parameterResolver: RouteParameterResolverForInjector) {
        this.route = route;
        this.next('auth', new HttpAuthEvent(this.injectorContext, this.request, this.response, this.route, parameterResolver));
    }

    notFound() {
        this.next('routeNotFound', new HttpRouteNotFoundEvent(this.injectorContext, this.request, this.response));
    }
}

export class HttpAuthEvent extends HttpWorkflowEventWithRoute {
    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public route: RouteConfig,
        public parameterResolver: RouteParameterResolverForInjector,
    ) {
        super(injectorContext, request, response, route);
    }

    success() {
        this.next('resolveParameters', new HttpResolveParametersEvent(this.injectorContext, this.request, this.response, this.parameterResolver, this.route));
    }
}

export class HttpAccessDeniedEvent extends HttpWorkflowEvent {
    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public route: RouteConfig,
    ) {
        super(injectorContext, request, response);
    }
}

export class HttpResolveParametersEvent extends HttpWorkflowEventWithRoute {
    public parameters: any[] = [];

    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public parameterResolver: RouteParameterResolverForInjector,
        public route: RouteConfig,
    ) {
        super(injectorContext, request, response, route);
    }

    accessDenied() {
        this.next('accessDenied', new HttpAccessDeniedEvent(this.injectorContext, this.request, this.response, this.route));
    }
}

export class HttpControllerEvent extends HttpWorkflowEventWithRoute {
    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public parameters: any[] = [],
        public route: RouteConfig,
    ) {
        super(injectorContext, request, response, route);
    }
}

export class HttpResponseEvent extends WorkflowEvent {
    /**
     * The time it took to call the controller action in milliseconds.
     */
    public controllerActionTime: number = 0;

    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public result: any,
        public route?: RouteConfig,
    ) {
        super();
    }
}

export class HttpControllerErrorEvent extends HttpWorkflowEventWithRoute {
    /**
     * The time it took to call the controller action in milliseconds.
     */
    public controllerActionTime: number = 0;

    constructor(
        public injectorContext: InjectorContext,
        public request: HttpRequest,
        public response: HttpResponse,
        public route: RouteConfig,
        public error: Error,
    ) {
        super(injectorContext, request, response, route);
    }
}

export const httpWorkflow = createWorkflow('http', {
    start: WorkflowEvent,
    request: HttpRequestEvent,
    route: HttpRouteEvent,
    routeNotFound: HttpRouteNotFoundEvent,
    auth: HttpAuthEvent,
    resolveParameters: HttpResolveParametersEvent,
    accessDenied: HttpAccessDeniedEvent,
    controller: HttpControllerEvent,
    controllerError: HttpControllerErrorEvent,
    parametersFailed: HttpControllerErrorEvent,
    response: HttpResponseEvent,
}, {
    start: 'request',
    request: 'route',
    route: ['auth', 'routeNotFound'],
    auth: ['resolveParameters', 'accessDenied'],
    resolveParameters: ['controller', 'parametersFailed'],
    accessDenied: 'response',
    controller: ['accessDenied', 'controllerError', 'response'],
    controllerError: 'response',
    parametersFailed: 'response',
    routeNotFound: 'response',
});

export class BaseResponse {
    constructor(public _statusCode?: number, public _headers: OutgoingHttpHeaders = {}) {
    }

    status(code: number): this {
        this._statusCode = code;
        return this;
    }

    header(name: string, value: string | number): this {
        this._headers[name] = value;
        return this;
    }

    headers(headers: OutgoingHttpHeaders): this {
        this._headers = headers;
        return this;
    }

    contentType(type: string): this {
        this._headers['content-type'] = type;
        return this;
    }
}

export class HtmlResponse extends BaseResponse {
    constructor(public html: string, statusCode?: number) {
        super(statusCode);
    }
}

export class JSONResponse extends BaseResponse {
    constructor(public json: any, statusCode?: number) {
        super(statusCode);
    }
}


@injectable()
export class HttpListener {
    constructor(
        protected router: Router,
        protected logger: Logger,
        @inject().optional protected stopwatch?: Stopwatch,
    ) {
    }

    @eventDispatcher.listen(httpWorkflow.onRequest, 100)
    onRequest(event: typeof httpWorkflow.onRequest.event): void {
        if (event.sent) return;
        if (event.hasNext()) return;

        event.next('route', new HttpRouteEvent(event.injectorContext, event.request, event.response,));
    }

    @eventDispatcher.listen(httpWorkflow.onRoute, 100)
    async onRoute(event: typeof httpWorkflow.onRoute.event) {
        if (event.sent) return;
        if (event.hasNext()) return;
        const logger = this.logger;

        try {
            const resolved = this.router.resolveRequest(event.request);

            if (resolved) {
                event.request.uploadedFiles = resolved.uploadedFiles;

                if (resolved.middlewares) {
                    const middlewares = resolved.middlewares(event.injectorContext);
                    if (middlewares.length) {

                        await asyncOperation((resolve, reject) => {
                            let lastTimer: any = undefined;

                            function finish() {
                                clearTimeout(lastTimer);
                                resolve(undefined);
                                //middleware finished the request. We end the workflow transition
                            }

                            event.response.once('finish', finish);
                            let i = -1;

                            function next() {
                                i++;
                                if (i >= middlewares.length) {
                                    event.response.off('finish', finish);
                                    resolve(undefined);
                                    return;
                                }

                                lastTimer = setTimeout(() => {
                                    logger.warning(`Middleware timed out. Increase the timeout or fix the middleware. (${middlewares[i].fn})`);
                                    next();
                                }, middlewares[i].timeout);

                                middlewares[i].fn(event.request, event.response, (error?: any) => {
                                    clearTimeout(lastTimer);
                                    if (error) {
                                        event.response.off('finish', finish);
                                        reject(error);
                                    } else {
                                        next();
                                    }
                                });
                            }

                            next();
                        });
                    }
                }

                event.routeFound(resolved.routeConfig, resolved.parameters);
            }
        } catch (error) {
            this.logger.error('Could not resolve request', error);
            event.notFound();
        }
    }

    @eventDispatcher.listen(httpWorkflow.onRoute, 1000)
    onRouteForward(event: typeof httpWorkflow.onRoute.event) {
        if (event.sent) return;
        if (event.hasNext()) return;

        if (!event.route) {
            event.next('routeNotFound', new HttpRouteNotFoundEvent(event.injectorContext, event.request, event.response));
        }
    }

    @eventDispatcher.listen(httpWorkflow.onRouteNotFound, 100)
    async routeNotFound(event: typeof httpWorkflow.onRouteNotFound.event): Promise<void> {
        if (event.sent) return;
        if (event.hasNext()) return;

        event.send(new HtmlResponse('Not found', 404));
    }

    @eventDispatcher.listen(httpWorkflow.onAuth, 100)
    onAuth(event: typeof httpWorkflow.onAuth.event): void {
        if (event.sent) return;
        if (event.hasNext()) return;

        event.next('resolveParameters', new HttpResolveParametersEvent(event.injectorContext, event.request, event.response, event.parameterResolver, event.route));
    }

    @eventDispatcher.listen(httpWorkflow.onResolveParameters, 100)
    async onResolveParameters(event: typeof httpWorkflow.onResolveParameters.event) {
        if (event.response.finished) return;
        if (event.hasNext()) return;

        try {
            event.parameters = await event.parameterResolver(event.injectorContext);
            event.next('controller', new HttpControllerEvent(event.injectorContext, event.request, event.response, event.parameters, event.route));
        } catch (error) {
            event.next('parametersFailed', new HttpControllerErrorEvent(event.injectorContext, event.request, event.response, event.route, error));
        }
    }

    @eventDispatcher.listen(httpWorkflow.onAccessDenied, 100)
    onAccessDenied(event: typeof httpWorkflow.onAccessDenied.event): void {
        if (event.sent) return;
        if (event.hasNext()) return;

        event.send(new HtmlResponse('Access denied', 403));
    }

    @eventDispatcher.listen(httpWorkflow.onController, 100)
    async onController(event: typeof httpWorkflow.onController.event) {
        if (event.sent) return;
        if (event.hasNext()) return;

        const controllerInstance = event.injectorContext.get(event.route.action.controller);
        const start = Date.now();
        const frame = this.stopwatch ? this.stopwatch.start(getClassName(event.route.action.controller)+'.'+event.route.action.methodName, FrameCategory.httpController) : undefined;
        try {
            const method = controllerInstance[event.route.action.methodName];
            let result = await method.apply(controllerInstance, event.parameters);

            if (isElementStruct(result)){
                const html = await getTemplateRender()(event.injectorContext, result, this.stopwatch ? this.stopwatch : undefined);
                result = new HtmlResponse(html, 200).header('Content-Type', 'text/html; charset=utf-8');
            }
            if (frame) frame.end();
            const responseEvent = new HttpResponseEvent(event.injectorContext, event.request, event.response, result, event.route);
            responseEvent.controllerActionTime = Date.now() - start;
            event.next('response', responseEvent);
        } catch (error) {
            if (frame) frame.end();
            if (error instanceof HttpAccessDeniedError) {
                event.next('accessDenied', new HttpAccessDeniedEvent(event.injectorContext, event.request, event.response, event.route));
            } else {
                const errorEvent = new HttpControllerErrorEvent(event.injectorContext, event.request, event.response, event.route, error);
                errorEvent.controllerActionTime = Date.now() - start;
                event.next('controllerError', errorEvent);
            }
        } finally {
        }
    }

    @eventDispatcher.listen(httpWorkflow.onParametersFailed, 100)
    onParametersFailed(event: typeof httpWorkflow.onParametersFailed.event): void {
        if (event.response.finished) return;
        if (event.sent) return;

        this.logger.error('Controller parameter resolving error:', event.error);

        if (event.error instanceof ValidationFailed) {
            event.send(new JSONResponse({
                message: event.error.message,
                errors: event.error.errors
            }, 500));
        } else {
            event.send(new HtmlResponse('Internal error', 500));
        }
    }

    @eventDispatcher.listen(httpWorkflow.onControllerError, 100)
    onControllerError(event: typeof httpWorkflow.onControllerError.event): void {
        if (event.response.finished) return;
        if (event.sent) return;

        this.logger.error('Controller error', event.error);

        event.send(new HtmlResponse('Internal error', 500));
    }

    /**
     * This happens before the result is sent.
     */
    @eventDispatcher.listen(httpWorkflow.onResponse, -100)
    async onResultSerialization(event: typeof httpWorkflow.onResponse.event) {
        if (event.route && event.route.returnSchema && event.route.returnSchema.typeSet) {
            if (event.result !== undefined) {
                if (event.result instanceof JSONResponse) {
                    event.result.json = getPropertyClassToXFunction(
                        event.route.returnSchema,
                        event.route && event.route?.serializer ? event.route.serializer : jsonSerializer
                    )(event.result.json, event.route.serializationOptions);
                } else {
                    event.result = getPropertyClassToXFunction(
                        event.route.returnSchema,
                        event.route && event.route?.serializer ? event.route.serializer : jsonSerializer
                    )(event.result, event.route.serializationOptions);
                }
            }
        }
    }

    @eventDispatcher.listen(httpWorkflow.onResponse, 100)
    async onResponse(event: typeof httpWorkflow.onResponse.event) {
        const response = event.result;

        if (event.response.headersSent) return;

        if (response === null || response === undefined) {
            event.response.end(response);
        } else if (response instanceof Redirect) {
            if (response.routeName) {
                event.response.writeHead(response.statusCode, {
                    Location: this.router.resolveUrl(response.routeName, response.routeParameters)
                });
            } else {
                event.response.writeHead(response.statusCode, {
                    Location: response.url
                });
            }
            event.response.end();
        } else if (response instanceof ServerResponse || response instanceof HttpResponse) {
        } else if (response instanceof HtmlResponse) {
            if (!event.response.hasHeader('Content-Type')) event.response.setHeader('Content-Type', 'text/html; charset=utf-8');
            event.response.writeHead(response._statusCode || 200, response._headers);
            event.response.end(response.html);
        } else if (isClassInstance(response) && isRegisteredEntity(getClassTypeFromInstance(response))) {
            event.response.setHeader('Content-Type', 'application/json; charset=utf-8');
            event.response.end(JSON.stringify(
                    (event.route && event.route?.serializer ? event.route.serializer : jsonSerializer)
                        .for(getClassTypeFromInstance(response)).serialize(
                        response,
                        event.route ? event.route.serializationOptions : undefined
                    )
                )
            );
        } else if (response instanceof Uint8Array) {
            event.response.end(response);
        } else if (response instanceof JSONResponse) {
            if (!event.response.hasHeader('Content-Type')) event.response.setHeader('Content-Type', 'application/json; charset=utf-8');
            event.response.writeHead(response._statusCode || 200, response._headers);
            event.response.end(JSON.stringify(response.json));
        } else {
            if (!event.response.hasHeader('Content-Type')) event.response.setHeader('Content-Type', 'application/json; charset=utf-8');
            event.response.end(JSON.stringify(response));
        }
    }
}
