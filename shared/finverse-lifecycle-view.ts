export type BankLifecycleView = {
 limit:number;accessEndsAt:string|null;
 connections:Array<{id:string;workspaceId:string;name:string;status:string;lastSyncedAt:string|null;inactivityDeadline:string;disconnectReason:string|null;disconnectError:string|null;disconnectedAt:string|null;disconnectAttempts:number;disconnectRetryAt:string|null;accounts:Array<{id:string;accountId:string|null;name:string;retained:boolean;unlinkedAt:string|null}>}>;
};
