/*
 * Deepkit Framework
 * Copyright (C) 2021 Deepkit UG, Marc J. Schmidt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 *
 * You should have received a copy of the MIT License along with this program.
 */
export class Session {
    constructor(username, token) {
        this.username = username;
        this.token = token;
    }
    isAnonymous() {
        return undefined === this.token;
    }
}
export class RpcKernelSecurity {
    async hasControllerAccess(session, controllerAccess) {
        return true;
    }
    async isAllowedToRegisterAsPeer(session, peerId) {
        return true;
    }
    async isAllowedToSendToPeer(session, peerId) {
        return true;
    }
    async authenticate(token) {
        throw new Error('Authentication not implemented');
    }
    transformError(err) {
        return err;
    }
}
export class SessionState {
    constructor() {
        this.session = new Session('anon', undefined);
    }
    setSession(session) {
        this.session = session;
    }
    getSession() {
        return this.session;
    }
}
//# sourceMappingURL=security.js.map