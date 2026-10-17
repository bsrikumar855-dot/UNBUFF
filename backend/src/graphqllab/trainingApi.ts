import { buildSchema, GraphQLError, type GraphQLSchema } from "graphql";

/**
 * The GraphQL Learning Lab's TRAINING API: a small, fixed, invented "campus placement hub". It is not connected to any
 * real data, any other student, or any external host. All resolvers are deterministic functions over the data below
 * plus one student's own mutable state (their applications). Students supply only GraphQL documents and variables,
 * never code, URLs, headers or tokens.
 */

export const SDL = `
"""A company that is hiring. Invented training data, not real companies."""
type Company {
  id: ID!
  name: String!
  industry: Industry!
  city: String!
  """Year the company was founded."""
  founded: Int!
  employees: Int!
  """Average rating from 1 to 5. Null when nobody has rated the company."""
  rating: Float
  """Open roles at this company, optionally filtered."""
  roles(minPackage: Float, remote: Boolean): [Role!]!
  """Restricted: only recruiters may read this. Students get an authorization error."""
  hiringContact: String
}

"""A job or internship."""
type Role {
  id: ID!
  title: String!
  level: Level!
  """Yearly package in lakhs per annum (LPA)."""
  packageLpa: Float!
  remote: Boolean!
  openings: Int!
  company: Company!
  skills: [Skill!]!
  description: String
}

"""A skill that roles ask for."""
type Skill {
  id: ID!
  name: String!
  category: String!
  """Roles that ask for this skill."""
  roles: [Role!]!
}

enum Industry { TECH FINANCE HEALTH RETAIL }
enum Level { INTERN ENTRY MID }
enum ApplicationStatus { APPLIED INTERVIEWING OFFER REJECTED WITHDRAWN }

"""One of YOUR applications. Only you can see and change these."""
type Application {
  id: ID!
  role: Role!
  status: ApplicationStatus!
  note: String
  appliedOn: String!
}

"""You, inside the training API."""
type Student {
  id: ID!
  displayName: String!
  applications(status: ApplicationStatus): [Application!]!
  applicationCount: Int!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}
type CompanyEdge {
  cursor: String!
  node: Company!
}
type CompanyConnection {
  edges: [CompanyEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

union SearchResult = Company | Role | Skill

type AdminStats {
  totalStudents: Int!
}

"""A problem with the input that the student can fix. Returned in the payload, not as a GraphQL error."""
type UserError {
  field: String
  message: String!
  code: String!
}

input ApplyInput {
  roleId: ID!
  note: String
}
input UpdateApplicationInput {
  status: ApplicationStatus
  note: String
}

type ApplyPayload {
  application: Application
  userErrors: [UserError!]!
}
type UpdateApplicationPayload {
  application: Application
  userErrors: [UserError!]!
}
type WithdrawPayload {
  application: Application
  userErrors: [UserError!]!
}
type ResetPayload {
  applicationCount: Int!
}

type Query {
  hello: String!
  company(id: ID!): Company
  """Companies, sorted by id, one page at a time. first is at most 10."""
  companies(first: Int = 3, after: String, industry: Industry): CompanyConnection!
  roles(companyId: ID, level: Level, minPackage: Float, remote: Boolean, skill: String): [Role!]!
  role(id: ID!): Role
  skills: [Skill!]!
  """Case-insensitive search over company names, role titles and skill names."""
  search(text: String!): [SearchResult!]!
  me: Student!
  """Restricted to admins. Students get an authorization error."""
  adminStats: AdminStats
  """A report generator that is always offline: it demonstrates resolver errors."""
  unavailableReport: String
}

type Mutation {
  """Apply to a role. Changes only your own training data."""
  applyToRole(input: ApplyInput!): ApplyPayload!
  updateApplication(id: ID!, input: UpdateApplicationInput!): UpdateApplicationPayload!
  """Safe to repeat: withdrawing an already withdrawn application is not an error."""
  withdrawApplication(id: ID!): WithdrawPayload!
  """Restore your training data to its starting state."""
  resetTrainingData: ResetPayload!
}
`;

// ---------------- fixed dataset ----------------

interface CompanyRow { id: string; name: string; industry: string; city: string; founded: number; employees: number; rating: number | null }
interface RoleRow { id: string; companyId: string; title: string; level: string; packageLpa: number; remote: boolean; openings: number; skills: string[]; description: string | null }
interface SkillRow { id: string; name: string; category: string }

export const COMPANIES: readonly CompanyRow[] = [
  { id: "c1", name: "Northwind Labs", industry: "TECH", city: "Bengaluru", founded: 2012, employees: 1200, rating: 4.4 },
  { id: "c2", name: "Meridian Bank", industry: "FINANCE", city: "Mumbai", founded: 1998, employees: 8000, rating: 4.0 },
  { id: "c3", name: "Helix Health", industry: "HEALTH", city: "Hyderabad", founded: 2015, employees: 600, rating: 4.6 },
  { id: "c4", name: "Cartwheel Retail", industry: "RETAIL", city: "Pune", founded: 2005, employees: 3000, rating: null },
  { id: "c5", name: "Orbit Systems", industry: "TECH", city: "Chennai", founded: 2010, employees: 900, rating: 4.2 },
  { id: "c6", name: "Quill Analytics", industry: "TECH", city: "Delhi", founded: 2018, employees: 150, rating: 4.7 },
];

export const SKILLS: readonly SkillRow[] = [
  { id: "s1", name: "JavaScript", category: "language" },
  { id: "s2", name: "TypeScript", category: "language" },
  { id: "s3", name: "Python", category: "language" },
  { id: "s4", name: "SQL", category: "data" },
  { id: "s5", name: "Java", category: "language" },
  { id: "s6", name: "GraphQL", category: "api" },
  { id: "s7", name: "React", category: "frontend" },
  { id: "s8", name: "Docker", category: "tooling" },
];

export const ROLES: readonly RoleRow[] = [
  { id: "r1", companyId: "c1", title: "Frontend Intern", level: "INTERN", packageLpa: 4.5, remote: false, openings: 3, skills: ["s1", "s7"], description: "Build screens with React." },
  { id: "r2", companyId: "c1", title: "Backend Engineer", level: "ENTRY", packageLpa: 14, remote: true, openings: 2, skills: ["s2", "s6", "s4"], description: "Design and run GraphQL services." },
  { id: "r3", companyId: "c2", title: "Data Analyst", level: "ENTRY", packageLpa: 9, remote: false, openings: 5, skills: ["s3", "s4"], description: null },
  { id: "r4", companyId: "c2", title: "Platform Engineer", level: "MID", packageLpa: 24, remote: true, openings: 1, skills: ["s5", "s8"], description: "Keep payment systems reliable." },
  { id: "r5", companyId: "c3", title: "Software Engineer", level: "ENTRY", packageLpa: 12, remote: false, openings: 4, skills: ["s2", "s7", "s6"], description: "Patient-facing web apps." },
  { id: "r6", companyId: "c3", title: "Data Science Intern", level: "INTERN", packageLpa: 5, remote: true, openings: 2, skills: ["s3"], description: "Notebook work with real constraints." },
  { id: "r7", companyId: "c4", title: "Full Stack Developer", level: "ENTRY", packageLpa: 10, remote: false, openings: 6, skills: ["s1", "s7", "s4"], description: null },
  { id: "r8", companyId: "c5", title: "Site Reliability Engineer", level: "MID", packageLpa: 22, remote: true, openings: 2, skills: ["s8", "s3"], description: "On-call rotations with runbooks." },
  { id: "r9", companyId: "c5", title: "Backend Intern", level: "INTERN", packageLpa: 4, remote: false, openings: 3, skills: ["s5", "s4"], description: "Pair with a mentor on services." },
  { id: "r10", companyId: "c6", title: "Analytics Engineer", level: "ENTRY", packageLpa: 16, remote: true, openings: 2, skills: ["s3", "s4", "s6"], description: "Dashboards backed by clean data." },
  { id: "r11", companyId: "c6", title: "Frontend Engineer", level: "ENTRY", packageLpa: 15, remote: true, openings: 1, skills: ["s2", "s7", "s6"], description: "Data-heavy interfaces." },
  { id: "r12", companyId: "c1", title: "Machine Learning Engineer", level: "MID", packageLpa: 26, remote: false, openings: 1, skills: ["s3", "s8"], description: "Ship models to production." },
];

const BY_COMPANY = new Map(COMPANIES.map((c) => [c.id, c]));
const BY_ROLE = new Map(ROLES.map((r) => [r.id, r]));
const BY_SKILL = new Map(SKILLS.map((s) => [s.id, s]));

// ---------------- one student's mutable state ----------------

export interface ApplicationRow {
  id: string;
  roleId: string;
  status: string;
  note: string | null;
  seq: number;
}
export interface StudentState {
  version: 1;
  nextSeq: number;
  applications: ApplicationRow[];
}

export const MAX_APPLICATIONS = 12;
export const MAX_NOTE = 140;

export function seedState(): StudentState {
  return {
    version: 1,
    nextSeq: 3,
    applications: [
      { id: "app_1", roleId: "r1", status: "APPLIED", note: "Referred by an alumnus", seq: 1 },
      { id: "app_2", roleId: "r5", status: "INTERVIEWING", note: null, seq: 2 },
    ],
  };
}

/** Per-request context handed to resolvers. `dirty` is set when a mutation really changed the student's state. */
export interface LabContext {
  state: StudentState;
  readOnly: boolean;
  dirty: boolean;
}

export const TRANSITIONS: Record<string, string[]> = {
  APPLIED: ["INTERVIEWING", "REJECTED", "WITHDRAWN"],
  INTERVIEWING: ["OFFER", "REJECTED", "WITHDRAWN"],
  OFFER: ["WITHDRAWN"],
  REJECTED: [],
  WITHDRAWN: [],
};

const isNil = (v: unknown): v is null | undefined => v === null || v === undefined;
const forbidden = (message: string) => new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
const userError = (field: string | null, message: string, code: string) => ({ field, message, code });

export const encodeCursor = (companyId: string) => Buffer.from(`company:${companyId}`, "utf8").toString("base64url");
function decodeCursor(cursor: string): string {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const m = /^company:(c\d{1,3})$/.exec(raw);
  if (!m || !BY_COMPANY.has(m[1]!)) throw new GraphQLError("The cursor is not valid. Use an endCursor returned by this API.", { extensions: { code: "BAD_CURSOR" } });
  return m[1]!;
}

// ---------------- object builders (functions are called by graphql-js with (args, context, info)) ----------------

const dateFor = (seq: number) => new Date(Date.UTC(2026, 0, 4 + seq)).toISOString().slice(0, 10);

const skillObj = (s: SkillRow): Record<string, unknown> => ({
  __typename: "Skill",
  id: s.id,
  name: s.name,
  category: s.category,
  roles: () => ROLES.filter((r) => r.skills.includes(s.id)).map(roleObj),
});

const companyObj = (c: CompanyRow): Record<string, unknown> => ({
  __typename: "Company",
  id: c.id,
  name: c.name,
  industry: c.industry,
  city: c.city,
  founded: c.founded,
  employees: c.employees,
  rating: c.rating,
  roles: (a: { minPackage?: number | null; remote?: boolean | null }) =>
    ROLES.filter((r) => r.companyId === c.id && (isNil(a.minPackage) || r.packageLpa >= a.minPackage) && (isNil(a.remote) || r.remote === a.remote)).map(roleObj),
  hiringContact: () => {
    throw forbidden("Only recruiters can read hiringContact. Students are not allowed to.");
  },
});

const roleObj = (r: RoleRow): Record<string, unknown> => ({
  __typename: "Role",
  id: r.id,
  title: r.title,
  level: r.level,
  packageLpa: r.packageLpa,
  remote: r.remote,
  openings: r.openings,
  description: r.description,
  company: () => companyObj(BY_COMPANY.get(r.companyId)!),
  skills: () => r.skills.map((id) => skillObj(BY_SKILL.get(id)!)),
});

const appObj = (a: ApplicationRow): Record<string, unknown> => ({
  id: a.id,
  role: () => roleObj(BY_ROLE.get(a.roleId)!),
  status: a.status,
  note: a.note,
  appliedOn: dateFor(a.seq),
});

const cleanNote = (raw: string | null | undefined): { note: string | null; error: ReturnType<typeof userError> | null } => {
  if (isNil(raw)) return { note: null, error: null };
  const note = raw.trim();
  if (note.length > MAX_NOTE) return { note: null, error: userError("note", `A note can have at most ${MAX_NOTE} characters.`, "NOTE_TOO_LONG") };
  return { note: note === "" ? null : note, error: null };
};

function requireWritable(ctx: LabContext): void {
  if (ctx.readOnly) throw new GraphQLError("Training data storage is unavailable right now, so mutations are turned off. Queries still work.", { extensions: { code: "TRAINING_DATA_READ_ONLY" } });
}

// ---------------- root resolvers ----------------

export const rootValue = {
  hello: () => "Hello, GraphQL!",

  company: (a: { id: string }) => {
    const c = BY_COMPANY.get(a.id);
    return c ? companyObj(c) : null;
  },

  companies: (a: { first?: number | null; after?: string | null; industry?: string | null }) => {
    const first = a.first ?? 3;
    if (first < 1 || first > 10) throw new GraphQLError("first must be between 1 and 10.", { extensions: { code: "BAD_USER_INPUT" } });
    const all = COMPANIES.filter((c) => isNil(a.industry) || c.industry === a.industry);
    let start = 0;
    if (!isNil(a.after)) {
      const id = decodeCursor(a.after);
      const at = all.findIndex((c) => c.id === id);
      start = at < 0 ? all.filter((c) => c.id <= id).length : at + 1; // a cursor from a different filter still resumes after that company
    }
    const page = all.slice(start, start + first);
    return {
      edges: page.map((c) => ({ cursor: encodeCursor(c.id), node: companyObj(c) })),
      pageInfo: {
        hasNextPage: start + first < all.length,
        hasPreviousPage: start > 0,
        startCursor: page[0] ? encodeCursor(page[0].id) : null,
        endCursor: page.length > 0 ? encodeCursor(page[page.length - 1]!.id) : null,
      },
      totalCount: all.length,
    };
  },

  roles: (a: { companyId?: string | null; level?: string | null; minPackage?: number | null; remote?: boolean | null; skill?: string | null }) => {
    const skillId = isNil(a.skill) ? null : SKILLS.find((s) => s.name.toLowerCase() === a.skill!.toLowerCase())?.id ?? "none";
    return ROLES.filter(
      (r) =>
        (isNil(a.companyId) || r.companyId === a.companyId) &&
        (isNil(a.level) || r.level === a.level) &&
        (isNil(a.minPackage) || r.packageLpa >= a.minPackage) &&
        (isNil(a.remote) || r.remote === a.remote) &&
        (isNil(skillId) || r.skills.includes(skillId)),
    ).map(roleObj);
  },

  role: (a: { id: string }) => {
    const r = BY_ROLE.get(a.id);
    return r ? roleObj(r) : null;
  },

  skills: () => SKILLS.map(skillObj),

  search: (a: { text: string }) => {
    const t = a.text.trim().toLowerCase();
    if (t === "") return [];
    return [
      ...COMPANIES.filter((c) => c.name.toLowerCase().includes(t)).map(companyObj),
      ...ROLES.filter((r) => r.title.toLowerCase().includes(t)).map(roleObj),
      ...SKILLS.filter((s) => s.name.toLowerCase().includes(t)).map(skillObj),
    ];
  },

  me: (_a: unknown, ctx: LabContext) => ({
    id: "you",
    displayName: "Training Student",
    applications: (args: { status?: string | null }) => ctx.state.applications.filter((x) => isNil(args.status) || x.status === args.status).map(appObj),
    applicationCount: ctx.state.applications.length,
  }),

  adminStats: () => {
    throw forbidden("adminStats is restricted to administrators.");
  },

  unavailableReport: () => {
    throw new GraphQLError("The report generator is offline. Try again later.", { extensions: { code: "SERVICE_UNAVAILABLE" } });
  },

  // ---- mutations: they change only ctx.state, which belongs to the calling student
  applyToRole: (a: { input: { roleId: string; note?: string | null } }, ctx: LabContext) => {
    requireWritable(ctx);
    const errors: ReturnType<typeof userError>[] = [];
    if (!BY_ROLE.has(a.input.roleId)) errors.push(userError("roleId", `There is no role with id ${a.input.roleId}.`, "ROLE_NOT_FOUND"));
    const { note, error } = cleanNote(a.input.note);
    if (error) errors.push(error);
    const active = ctx.state.applications.find((x) => x.roleId === a.input.roleId && x.status !== "WITHDRAWN" && x.status !== "REJECTED");
    if (active) errors.push(userError("roleId", "You already have an active application for this role.", "ALREADY_APPLIED"));
    if (ctx.state.applications.length >= MAX_APPLICATIONS) errors.push(userError(null, `You can keep at most ${MAX_APPLICATIONS} applications in the training data. Withdraw one or reset.`, "LIMIT_REACHED"));
    if (errors.length > 0) return { application: null, userErrors: errors };
    const row: ApplicationRow = { id: `app_${ctx.state.nextSeq}`, roleId: a.input.roleId, status: "APPLIED", note, seq: ctx.state.nextSeq };
    ctx.state.nextSeq += 1;
    ctx.state.applications.push(row);
    ctx.dirty = true;
    return { application: appObj(row), userErrors: [] };
  },

  updateApplication: (a: { id: string; input: { status?: string | null; note?: string | null } }, ctx: LabContext) => {
    requireWritable(ctx);
    const row = ctx.state.applications.find((x) => x.id === a.id);
    if (!row) return { application: null, userErrors: [userError("id", `There is no application with id ${a.id}.`, "APPLICATION_NOT_FOUND")] };
    const errors: ReturnType<typeof userError>[] = [];
    if (isNil(a.input.status) && a.input.note === undefined) errors.push(userError(null, "Provide a status or a note to update.", "NOTHING_TO_UPDATE"));
    if (!isNil(a.input.status) && a.input.status !== row.status && !(TRANSITIONS[row.status] ?? []).includes(a.input.status)) {
      errors.push(userError("status", `An application cannot move from ${row.status} to ${a.input.status}.`, "INVALID_TRANSITION"));
    }
    const { note, error } = cleanNote(a.input.note);
    if (error) errors.push(error);
    if (errors.length > 0) return { application: null, userErrors: errors };
    if (!isNil(a.input.status)) row.status = a.input.status;
    if (a.input.note !== undefined) row.note = note;
    ctx.dirty = true;
    return { application: appObj(row), userErrors: [] };
  },

  withdrawApplication: (a: { id: string }, ctx: LabContext) => {
    requireWritable(ctx);
    const row = ctx.state.applications.find((x) => x.id === a.id);
    if (!row) return { application: null, userErrors: [userError("id", `There is no application with id ${a.id}.`, "APPLICATION_NOT_FOUND")] };
    if (row.status !== "WITHDRAWN") {
      row.status = "WITHDRAWN";
      ctx.dirty = true;
    }
    return { application: appObj(row), userErrors: [] };
  },

  resetTrainingData: (_a: unknown, ctx: LabContext) => {
    requireWritable(ctx);
    ctx.state = seedState();
    ctx.dirty = true;
    return { applicationCount: ctx.state.applications.length };
  },
};

let cached: GraphQLSchema | null = null;
/** The one schema every execution, validation and documentation view uses. */
export function trainingSchema(): GraphQLSchema {
  cached ??= buildSchema(SDL);
  return cached;
}
