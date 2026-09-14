import type {
  AccountActionInput,
  AdminConnectionRow,
  AdminConnectionsQuery,
  AdminTranscript,
  AdminUserDetail,
  AdminUserRow,
  ApiErrorBody,
  AssignRoleInput,
  AuditLogView,
  AuditQuery,
  AuthResponse,
  ChatDetail,
  ConnectionDecisionInput,
  ConnectionView,
  FamilyLink,
  FamilyOverview,
  FeedResponse,
  InviteCreated,
  LinkKind,
  LoginInput,
  MessageView,
  ModerationQueue,
  OnboardingInput,
  Paginated,
  PhotoUploadInput,
  ProfileUpdateInput,
  ReadinessResult,
  RegisterInput,
  ReportInput,
  ReportUpdateInput,
  SelfUser,
  SystemMetrics,
  UserDirectoryQuery,
} from "./contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

type TokenProvider = () => Promise<string | null>;
type AuthFailureHandler = (error: ApiError) => void;

let tokenProvider: TokenProvider = async () => null;
let onAuthFailure: AuthFailureHandler = () => {};

export function configureApiAuth(provider: TokenProvider, failureHandler: AuthFailureHandler): void {
  tokenProvider = provider;
  onAuthFailure = failureHandler;
}

const AUTH_FAILURE_CODES = new Set(["INVALID_TOKEN", "UNAUTHENTICATED", "ACCOUNT_BANNED", "ACCOUNT_SUSPENDED"]);

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    "code" in value &&
    typeof value.code === "string"
  );
}

interface RequestOptions {
  /** Attach the current bearer token (default true). */
  auth?: boolean;
  /** Use this bearer token instead of the provider's. */
  token?: string;
  timeoutMs?: number;
}

async function send(method: string, path: string, body: unknown, options: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = options.token ?? (options.auth === false ? null : await tokenProvider());
    if (token) headers.Authorization = `Bearer ${token}`;

    return await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "AbortError";
    throw new ApiError(
      0,
      timedOut ? "TIMEOUT" : "NETWORK",
      timedOut ? "The server took too long to respond. Please try again." : "Could not reach the server. Check your connection.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function toError(res: Response, options: RequestOptions): Promise<ApiError> {
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  const error = isErrorBody(parsed)
    ? new ApiError(res.status, parsed.code, parsed.error, parsed.details)
    : new ApiError(
        res.status,
        `HTTP_${res.status}`,
        res.status >= 500 ? "The server is temporarily unavailable. Please try again shortly." : "The request failed.",
      );
  if (options.auth !== false && options.token === undefined && AUTH_FAILURE_CODES.has(error.code)) {
    onAuthFailure(error);
  }
  return error;
}

async function request<T>(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const res = await send(method, path, body, options);
  if (!res.ok) throw await toError(res, options);
  if (res.status === 204) return undefined as T;
  // Response shapes are defined by the shared contracts in ./contracts.
  return (await res.json()) as T;
}

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function fetchPhoto(userId: string, variant: "full" | "blur"): Promise<Blob> {
  const res = await send("GET", `/api/photos/${userId}/${variant}`, undefined, {});
  if (!res.ok) throw await toError(res, {});
  return res.blob();
}

export const api = {
  register: (input: RegisterInput) => request<AuthResponse>("POST", "/api/auth/register", input, { auth: false }),
  login: (input: LoginInput) => request<AuthResponse>("POST", "/api/auth/login", input, { auth: false }),
  firebaseSignIn: (idToken: string) => request<SelfUser>("POST", "/api/auth/firebase", undefined, { token: idToken }),

  me: () => request<SelfUser>("GET", "/api/me"),
  completeOnboarding: (input: OnboardingInput) => request<SelfUser>("POST", "/api/me/onboarding", input),
  updateProfile: (input: ProfileUpdateInput) => request<SelfUser>("PATCH", "/api/me/profile", input),
  uploadPhoto: (input: PhotoUploadInput) => request<SelfUser>("PUT", "/api/me/photo", input, { timeoutMs: 60_000 }),
  deletePhoto: () => request<SelfUser>("DELETE", "/api/me/photo"),

  submitReadiness: (moduleId: string, answers: number[]) =>
    request<ReadinessResult>("POST", `/api/readiness/${moduleId}`, { answers }),

  feed: () => request<FeedResponse>("GET", "/api/feed"),
  connections: () => request<ConnectionView[]>("GET", "/api/connections"),
  requestConnection: (receiverId: string) => request<ConnectionView>("POST", "/api/connections", { receiverId }),
  decide: (id: string, input: ConnectionDecisionInput) =>
    request<ConnectionView>("POST", `/api/connections/${id}/decision`, input),
  withdraw: (id: string) => request<ConnectionView>("POST", `/api/connections/${id}/withdraw`, {}),
  terminate: (id: string, reason?: string) =>
    request<ConnectionView>("POST", `/api/connections/${id}/terminate`, { reason: reason ?? null }),
  photoConsent: (id: string, consent: boolean) =>
    request<ConnectionView>("POST", `/api/connections/${id}/photo-consent`, { consent }),

  chat: (id: string, after?: string) => request<ChatDetail>("GET", `/api/chats/${id}${queryString({ after })}`),
  sendMessage: (id: string, text: string) => request<MessageView>("POST", `/api/chats/${id}/messages`, { text }),

  family: () => request<FamilyOverview>("GET", "/api/family"),
  createInvite: (kind: LinkKind) => request<InviteCreated>("POST", "/api/family/invites", { kind }),
  revokeInvite: (id: string) => request<void>("DELETE", `/api/family/invites/${id}`),
  redeemInvite: (code: string) => request<FamilyLink>("POST", "/api/family/redeem", { code }),
  removeLink: (id: string) => request<void>("DELETE", `/api/family/links/${id}`),

  report: (input: ReportInput) => request<{ id: string }>("POST", "/api/reports", input),

  admin: {
    metrics: () => request<SystemMetrics>("GET", "/api/admin/metrics"),
    moderation: () => request<ModerationQueue>("GET", "/api/admin/moderation"),
    users: (query: Partial<UserDirectoryQuery>) =>
      request<Paginated<AdminUserRow>>("GET", `/api/admin/users${queryString({ ...query })}`),
    userDetail: (id: string) => request<AdminUserDetail>("GET", `/api/admin/users/${id}`),
    setStatus: (id: string, input: AccountActionInput) =>
      request<AdminUserRow>("POST", `/api/admin/users/${id}/status`, input),
    assignRole: (id: string, input: AssignRoleInput) => request<AdminUserRow>("POST", `/api/admin/users/${id}/role`, input),
    removePhoto: (id: string, reason: string) => request<AdminUserRow>("DELETE", `/api/admin/users/${id}/photo`, { reason }),
    connections: (query: Partial<AdminConnectionsQuery>) =>
      request<Paginated<AdminConnectionRow>>("GET", `/api/admin/connections${queryString({ ...query })}`),
    transcript: (id: string) => request<AdminTranscript>("GET", `/api/admin/connections/${id}/transcript`),
    updateReport: (id: string, input: ReportUpdateInput) =>
      request<{ id: string }>("PATCH", `/api/admin/reports/${id}`, input),
    auditLogs: (query: Partial<AuditQuery>) =>
      request<Paginated<AuditLogView>>("GET", `/api/admin/audit-logs${queryString({ ...query })}`),
    runCleanup: () =>
      request<{ terminatedConnectionIds: string[]; liftedSuspensionUserIds: string[] }>(
        "POST",
        "/api/admin/maintenance/cleanup",
        {},
      ),
  },
};

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}
