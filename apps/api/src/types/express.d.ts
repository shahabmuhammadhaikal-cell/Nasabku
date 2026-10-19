import type { AuthContext, WorkspaceContext } from "./context";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
    auth?: AuthContext;
    workspace?: WorkspaceContext;
  }
}

export {};
