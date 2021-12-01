import { ClassType } from '@deepkit/core';
export declare class Session {
    readonly username: string;
    readonly token: any;
    constructor(username: string, token: any);
    isAnonymous(): boolean;
}
export interface RpcControllerAccess {
    controllerName: string;
    controllerClassType: ClassType;
    actionName: string;
    actionGroups: string[];
    actionData: {
        [name: string]: any;
    };
}
export declare class RpcKernelSecurity {
    hasControllerAccess(session: Session, controllerAccess: RpcControllerAccess): Promise<boolean>;
    isAllowedToRegisterAsPeer(session: Session, peerId: string): Promise<boolean>;
    isAllowedToSendToPeer(session: Session, peerId: string): Promise<boolean>;
    authenticate(token: any): Promise<Session>;
    transformError(err: Error): Error;
}
export declare class SessionState {
    protected session: Session;
    setSession(session: Session): void;
    getSession(): Session;
}
