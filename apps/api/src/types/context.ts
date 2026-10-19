import type { Env } from "@nasabku/config";
import type { Role } from "@nasabku/shared";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Logger } from "pino";

export interface AuthContext {
  uid: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export interface WorkspaceContext {
  id: string;
  slug: string;
  status: string;
  role: Role;
  membershipId: string;
}

export interface ApiDeps {
  env: Env;
  logger: Logger;
  db: Firestore;
  firebaseAuth: Auth;
}
