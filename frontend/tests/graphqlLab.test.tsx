import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "@/App";
import { AuthProvider } from "@/auth/AuthContext";
import type { AuthClient, AuthUser } from "@/auth/types";
import { api } from "@/api/endpoints";
import { ApiError } from "@/api/types";
import type {
  LabExecuteResponse,
  LabExercise,
  LabHelpResponse,
  LabModuleDetail,
  LabModuleSummary,
  LabModulesResponse,
  LabProgressResponse,
  LabSubmitResponse,
  LabTrainingSchemaResponse,
} from "@/types/contract";

// Monaco cannot run in jsdom. The real editor is checked in a browser instead.
vi.mock("@/components/graphqllab/GraphqlEditor", () => ({
  default: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/api/endpoints", () => ({
  api: {
    getLabModules: vi.fn(),
    getLabModule: vi.fn(),
    getLabExercise: vi.fn(),
    getLabTrainingSchema: vi.fn(),
    executeLab: vi.fn(),
    hintLab: vi.fn(),
    submitLab: vi.fn(),
    getLabProgress: vi.fn(),
    getLabAttempts: vi.fn(),
    resetLabTrainingData: vi.fn(),
    deleteLabProgress: vi.fn(),
    labHelp: vi.fn(),
    getHealth: vi.fn(),
    getRoles: vi.fn(),
  },
}));
const mocked = vi.mocked(api);

const user: AuthUser = { uid: "u1", email: "a@b.co" };
const fakeAuth = (u: AuthUser | null): AuthClient => ({
  configured: true,
  onChange(cb) {
    queueMicrotask(() => cb(u));
    return () => undefined;
  },
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(async () => undefined),
  sendPasswordReset: vi.fn(),
  getIdToken: vi.fn(async () => (u ? "t" : null)),
});
const renderAt = (path: string, u: AuthUser | null = user) =>
  render(
    <AuthProvider client={fakeAuth(u)}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>
  );

const mod = (over: Partial<LabModuleSummary> = {}): LabModuleSummary => ({
  id: "m1-fundamentals",
  order: 1,
  title: "GraphQL fundamentals",
  summary: "What GraphQL is.",
  difficulty: "beginner",
  prerequisites: [],
  recommended_first: [],
  lesson_count: 2,
  exercise_count: 4,
  status: "not_started",
  lessons_completed: 0,
  exercises_passed: 0,
  ...over,
});
const modules = (
  list: LabModuleSummary[] = [
    mod(),
    mod({
      id: "m2-schemas-types",
      order: 2,
      title: "Schemas, object types and scalars",
      prerequisites: ["m1-fundamentals"],
      recommended_first: ["m1-fundamentals"],
    }),
  ]
): LabModulesResponse => ({ modules: list, current_module_id: list[0]!.id });
const progress = (over: Partial<LabProgressResponse> = {}): LabProgressResponse => ({
  has_started: false,
  totals: {
    modules_started: 0,
    modules_completed: 0,
    modules_total: 10,
    lessons_completed: 0,
    lessons_total: 20,
    exercises_attempted: 0,
    exercises_passed: 0,
    exercises_total: 52,
    attempts: 0,
  },
  current_module_id: "m1-fundamentals",
  modules: [],
  recent_activity: [],
  needs_another_attempt: [],
  definitions: [
    { metric: "Exercises passed", meaning: "Exercises whose configured check passed." },
    { metric: "Separate from DSA", meaning: "Not mixed into DSA analytics." },
  ],
  ...over,
});

const ex = (over: Partial<LabExercise> = {}): LabExercise => ({
  id: "m1-e2",
  module_id: "m1-fundamentals",
  lesson_id: "m1-l2",
  order: 2,
  title: "Say hello",
  type: "query",
  difficulty: "beginner",
  description: "Ask the server for the hello field.",
  objectives: ["Write and run your first query"],
  concepts: ["selection-set", "query-basics"],
  requirements: ["Select the hello field"],
  starter_query: "{\n  # select a field here\n}",
  starter_variables: null,
  example: { query: "{\n  hello\n}" },
  options: null,
  multi_select: false,
  schema_excerpt: null,
  hints_total: 2,
  max_answer_chars: null,
  grading: "Your query is validated against the training schema, run, and compared.",
  version: 1,
  provenance: "authored_original",
  student: {
    attempts: 0,
    passed: false,
    passed_at: null,
    hints_used: 0,
    last_attempt_at: null,
  },
  ...over,
});
const choiceEx = ex({
  id: "m1-e1",
  order: 1,
  lesson_id: "m1-l1",
  type: "multiple_choice",
  title: "How a client gets data",
  description: "Which statement is best?",
  starter_query: null,
  example: null,
  options: [
    { id: "a", text: "Many URLs" },
    { id: "b", text: "One query" },
  ],
});
const textEx = ex({
  id: "m10-e8",
  order: 8,
  type: "explanation",
  title: "Explain N+1",
  description: "Explain it.",
  starter_query: null,
  example: null,
  max_answer_chars: 900,
});

const detail = (
  exercises: LabExercise[] = [choiceEx, ex()],
  over: Partial<LabModuleDetail> = {}
): LabModuleDetail => ({
  module: mod({ exercise_count: exercises.length }),
  objectives: ["Explain what GraphQL is"],
  completion_criteria: "Pass all four exercises in this module.",
  lessons: [
    {
      id: "m1-l1",
      title: "What GraphQL is",
      objectives: ["Define GraphQL"],
      completed: false,
      exercise_ids: ["m1-e1"],
      blocks: [
        { kind: "p", text: "GraphQL is a query language for APIs." },
        { kind: "list", items: ["REST: many endpoints", "GraphQL: one endpoint"] },
      ],
    },
    {
      id: "m1-l2",
      title: "Your first request",
      objectives: ["Run a query"],
      completed: false,
      exercise_ids: ["m1-e2"],
      blocks: [
        { kind: "code", language: "graphql", code: "{ roles { title } }" },
        {
          kind: "try",
          label: "Run the roles query",
          query: "{\n  roles {\n    title\n  }\n}",
        },
      ],
    },
  ],
  exercises,
  ...over,
});

const schema: LabTrainingSchemaResponse = {
  sdl: "type Query { hello: String! }",
  query_type: "Query",
  mutation_type: "Mutation",
  limits: {
    max_query_chars: 4000,
    max_variables_chars: 2000,
    max_depth: 7,
    max_fields: 120,
    max_result_bytes: 60000,
  },
  types: [
    {
      name: "Query",
      kind: "OBJECT",
      description: null,
      enum_values: [],
      possible_types: [],
      fields: [
        { name: "hello", type: "String!", description: null, args: [] },
        {
          name: "roles",
          type: "[Role!]!",
          description: null,
          args: [{ name: "level", type: "Level", default: null, description: null }],
        },
      ],
    },
    {
      name: "Role",
      kind: "OBJECT",
      description: "A job or internship.",
      enum_values: [],
      possible_types: [],
      fields: [{ name: "title", type: "String!", description: null, args: [] }],
    },
    {
      name: "Level",
      kind: "ENUM",
      description: null,
      possible_types: [],
      fields: [],
      enum_values: [
        { name: "INTERN", description: null },
        { name: "ENTRY", description: null },
      ],
    },
  ],
};

const ok = (
  data: unknown,
  over: Partial<LabExecuteResponse> = {}
): LabExecuteResponse => ({
  phase: "ok",
  operation: "query",
  result: { data },
  state_changed: false,
  training_data: "per_student",
  ...over,
});
const submitted = (over: Partial<LabSubmitResponse> = {}): LabSubmitResponse => ({
  attempt: {
    id: "att_1",
    exercise_id: "m1-e2",
    at: "2026-06-15T12:00:00Z",
    passed: true,
    query: "{ hello }",
    variables: null,
    answer: null,
    feedback: "Your query returned exactly what the task asked for.",
    checks: [],
  },
  outcome: "passed",
  feedback: "Your query returned exactly what the task asked for.",
  checks: [
    { label: "Is valid GraphQL for the training schema", passed: true },
    { label: "Returns exactly the requested response", passed: true },
  ],
  hint: null,
  explanation: "A query is a selection set.",
  lesson: {
    module_id: "m1-fundamentals",
    lesson_id: "m1-l2",
    title: "Your first request",
  },
  newly_completed: { lesson: false, module: false },
  exercise: {
    attempts: 1,
    passed: true,
    passed_at: "2026-06-15T12:00:00Z",
    hints_used: 0,
    last_attempt_at: "2026-06-15T12:00:00Z",
  },
  execution: ok({ hello: "Hello, GraphQL!" }),
  replayed: false,
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  mocked.getLabModules.mockResolvedValue(modules());
  mocked.getLabProgress.mockResolvedValue(progress());
  mocked.getLabModule.mockResolvedValue(detail());
  mocked.getLabTrainingSchema.mockResolvedValue(schema);
  mocked.getLabAttempts.mockResolvedValue({ attempts: [] });
});

describe("GraphQL Lab overview", () => {
  it("shows an honest empty state, the learning path in order, and prerequisites as a recommendation", async () => {
    renderAt("/graphql-lab");
    expect(
      await screen.findByRole("heading", { name: "GraphQL Learning Lab" })
    ).toBeInTheDocument();
    expect(await screen.findByText(/You have not started yet/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "GraphQL fundamentals" })[0]
    ).toHaveAttribute("href", "/graphql-lab/modules/m1-fundamentals");
    expect(
      screen.getByText(
        /Recommended first: GraphQL fundamentals\. You can still open this module now/
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested next: GraphQL fundamentals.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the playground" })).toHaveAttribute(
      "href",
      "/graphql-lab/playground"
    );
    expect(screen.queryByText("Exercises passed")).not.toBeInTheDocument(); // no stats for someone who has not started
  });

  it("shows progress, recent activity and concepts that need another attempt, with what each number means", async () => {
    mocked.getLabModules.mockResolvedValue(
      modules([
        mod({ status: "completed", exercises_passed: 4, lessons_completed: 2 }),
        mod({
          id: "m2-schemas-types",
          order: 2,
          title: "Schemas, object types and scalars",
          status: "in_progress",
          exercises_passed: 1,
          exercise_count: 5,
          lessons_completed: 0,
        }),
      ])
    );
    mocked.getLabProgress.mockResolvedValue(
      progress({
        has_started: true,
        totals: {
          modules_started: 2,
          modules_completed: 1,
          modules_total: 10,
          lessons_completed: 2,
          lessons_total: 20,
          exercises_attempted: 6,
          exercises_passed: 5,
          exercises_total: 52,
          attempts: 9,
        },
        recent_activity: [
          {
            at: "2026-06-15T12:00:00Z",
            kind: "passed",
            exercise_id: "m1-e4",
            exercise_title: "Reading a response",
            module_id: "m1-fundamentals",
          },
        ],
        needs_another_attempt: [
          { concept: "nested-fields", exercise_ids: ["m3-e1", "m3-e2"] },
        ],
      })
    );
    renderAt("/graphql-lab");
    expect(await screen.findByText("1 of 10")).toBeInTheDocument();
    expect(screen.getByText("5 of 52")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reading a response" })).toHaveAttribute(
      "href",
      "/graphql-lab/modules/m1-fundamentals?exercise=m1-e4"
    );
    expect(screen.getByText(/nested fields/)).toBeInTheDocument();
    expect(screen.getByText(/2 exercises not passed yet/)).toBeInTheDocument();
    expect(screen.getByText(/Not mixed into DSA analytics/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 of 4 exercises passed|4 of 4 exercises passed/)
    ).toBeInTheDocument();
  });

  it("shows a retryable error", async () => {
    mocked.getLabModules
      .mockRejectedValueOnce(new ApiError("x", "GRAPHQL_LAB_UNAVAILABLE", 503))
      .mockResolvedValueOnce(modules());
    renderAt("/graphql-lab");
    expect(
      await screen.findByText(/progress could not be saved or loaded/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      (await screen.findAllByRole("link", { name: "GraphQL fundamentals" })).length
    ).toBeGreaterThan(0);
  });

  it("deletes the student's Lab data only after confirmation", async () => {
    mocked.deleteLabProgress.mockResolvedValue(undefined);
    renderAt("/graphql-lab");
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete my GraphQL Lab data" })
    );
    expect(mocked.deleteLabProgress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete my GraphQL Lab data" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete it" }));
    await waitFor(() => expect(mocked.deleteLabProgress).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocked.getLabModules).toHaveBeenCalledTimes(2));
  });

  it("is only for signed-in students", async () => {
    renderAt("/graphql-lab", null);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mocked.getLabModules).not.toHaveBeenCalled();
  });
});

describe("GraphQL playground", () => {
  it("runs a query against the server and shows the formatted response", async () => {
    mocked.executeLab.mockResolvedValue(ok({ roles: [{ title: "Frontend Intern" }] }));
    renderAt("/graphql-lab/playground");
    fireEvent.click(await screen.findByRole("button", { name: "Run query" }));
    expect(await screen.findByLabelText("Response data")).toHaveTextContent(
      '"title": "Frontend Intern"'
    );
    expect(screen.getByText(/Ran successfully/)).toBeInTheDocument();
    expect(mocked.executeLab.mock.calls[0]![0]).toMatchObject({
      query: expect.stringContaining("roles(remote: true)"),
      variables: null,
    });
  });

  it("validates the variables as JSON before running anything", async () => {
    renderAt("/graphql-lab/playground");
    const vars = await screen.findByLabelText(/Variables/);
    fireEvent.change(vars, { target: { value: "{ not json" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not valid JSON/);
    expect(screen.getByRole("button", { name: "Run query" })).toBeDisabled();
    fireEvent.change(vars, { target: { value: "[1]" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/must be a JSON object/);
    fireEvent.change(vars, { target: { value: '{ "id": "r2" }' } });
    mocked.executeLab.mockResolvedValue(ok({}));
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    await waitFor(() =>
      expect(mocked.executeLab).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { id: "r2" } })
      )
    );
  });

  it("explains syntax, validation, variable, execution and authorization failures by stage and category", async () => {
    renderAt("/graphql-lab/playground");
    const run = async (r: LabExecuteResponse) => {
      mocked.executeLab.mockResolvedValueOnce(r);
      fireEvent.click(await screen.findByRole("button", { name: "Run query" }));
    };
    await run({
      phase: "syntax",
      operation: null,
      result: {
        errors: [
          {
            message: "Syntax Error: Expected Name, found <EOF>.",
            locations: [{ line: 3, column: 1 }],
            category: "syntax",
            code: null,
          },
        ],
      },
      state_changed: false,
      training_data: "per_student",
    });
    expect(
      await screen.findByText(/Syntax error: the text is not valid GraphQL/)
    ).toBeInTheDocument();
    expect(screen.getByText("line 3, column 1", { exact: false })).toBeInTheDocument();
    await run({
      phase: "validation",
      operation: null,
      result: {
        errors: [
          {
            message: 'Cannot query field "title" on type "Skill".',
            category: "validation",
            code: null,
          },
        ],
      },
      state_changed: false,
      training_data: "per_student",
    });
    expect(
      await screen.findByText(/Validation error: the query does not fit the schema/)
    ).toBeInTheDocument();
    await run({
      phase: "variables",
      operation: null,
      result: {
        errors: [
          {
            message: 'Variable "$id" of required type "ID!" was not provided.',
            category: "variables",
            code: null,
          },
        ],
      },
      state_changed: false,
      training_data: "per_student",
    });
    expect(await screen.findByText(/Variables error/)).toBeInTheDocument();
    await run({
      phase: "execution",
      operation: "query",
      result: {
        data: { hello: "Hello, GraphQL!", adminStats: null },
        errors: [
          {
            message: "adminStats is restricted to administrators.",
            path: ["adminStats"],
            category: "authorization",
            code: "FORBIDDEN",
          },
        ],
      },
      state_changed: false,
      training_data: "per_student",
    });
    const errors = await screen.findByRole("list", { name: "Errors" });
    expect(within(errors).getByText("Authorization")).toBeInTheDocument();
    expect(
      within(errors).getByText(/at adminStats · code FORBIDDEN/)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Response data")).toHaveTextContent(
      '"adminStats": null'
    ); // data and errors together
  });

  it("says when training data storage is unavailable and when a mutation changed data", async () => {
    renderAt("/graphql-lab/playground");
    mocked.executeLab.mockResolvedValueOnce(
      ok({ hello: "x" }, { training_data: "read_only" })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Run query" }));
    expect(
      await screen.findByText(/storage is unavailable, so mutations are turned off/)
    ).toBeInTheDocument();
    mocked.executeLab.mockResolvedValueOnce(
      ok({}, { operation: "mutation", state_changed: true })
    );
    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(await screen.findByText(/Your training data was changed/)).toBeInTheDocument();
  });

  it("shows a service-unavailable error with retry, and resets the training data on request", async () => {
    mocked.executeLab
      .mockRejectedValueOnce(new ApiError("x", "RATE_LIMITED", 429))
      .mockResolvedValueOnce(ok({ hello: "ok" }));
    mocked.resetLabTrainingData.mockResolvedValue({ application_count: 2 });
    renderAt("/graphql-lab/playground");
    fireEvent.click(await screen.findByRole("button", { name: "Run query" }));
    expect(await screen.findByText(/Too many requests/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Response data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset my training data" }));
    expect(
      await screen.findByText(/back to its starting state \(2 applications\)/)
    ).toBeInTheDocument();
  });

  it("builds the schema reference from the server's schema, and inserts a field into the query", async () => {
    renderAt("/graphql-lab/playground");
    expect(
      await screen.findByRole("region", { name: "Schema explorer" })
    ).toBeInTheDocument();
    expect(screen.getByText("roles(level: Level): [Role!]!")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Role" }));
    expect(screen.getByText("A job or internship.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Level" }));
    expect(screen.getByText(/Values: INTERN, ENTRY/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Query" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert hello at the cursor" }));
    expect(
      (screen.getByLabelText("GraphQL query") as HTMLTextAreaElement).value
        .trim()
        .endsWith("hello")
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Find a type or field"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No types match.")).toBeInTheDocument();
    expect(screen.getByText(/At most 4000 characters/)).toBeInTheDocument();
  });

  it("keeps working when the schema cannot load, with a retry", async () => {
    mocked.getLabTrainingSchema
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(schema);
    mocked.executeLab.mockResolvedValue(ok({ hello: "ok" }));
    renderAt("/graphql-lab/playground");
    fireEvent.click(await screen.findByRole("button", { name: "Run query" }));
    expect(await screen.findByLabelText("Response data")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("region", { name: "Schema explorer" })
    ).toBeInTheDocument();
  });

  it("resets the editor to its starter and asks the mentor in context", async () => {
    mocked.labHelp.mockResolvedValue({
      reply: "(mock mentor, no live model) Think about the selection set.",
      mock: true,
      query_status: { phase: "validation", error_count: 1 },
      memory_saved: [],
    } as LabHelpResponse);
    renderAt("/graphql-lab/playground");
    const editor = (await screen.findByLabelText("GraphQL query")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "{ skills { title } }" } });
    fireEvent.click(screen.getByRole("button", { name: "Why does it fail?" }));
    const answer = await screen.findByLabelText("Mentor answer");
    expect(answer).toHaveTextContent("Mock mentor: this is a built-in stand-in");
    expect(answer).toHaveTextContent(/Validation error.*\(1 error\)/);
    expect(mocked.labHelp).toHaveBeenCalledWith({
      action: "explain_error",
      query: "{ skills { title } }",
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset to starter code" }));
    expect(editor.value).toContain("roles(remote: true)");
  });
});

describe("module page and exercises", () => {
  it("shows objectives, completion rule, lessons with examples and the exercise list", async () => {
    renderAt("/graphql-lab/modules/m1-fundamentals");
    expect(
      await screen.findByRole("heading", { name: "GraphQL fundamentals" })
    ).toBeInTheDocument();
    expect(screen.getByText("Explain what GraphQL is")).toBeInTheDocument();
    expect(
      screen.getByText(/completed only when every exercise has actually passed its check/)
    ).toBeInTheDocument();
    expect(screen.getByText("GraphQL is a query language for APIs.")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Exercises" });
    expect(within(list).getByText(/How a client gets data/)).toBeInTheDocument();
    expect(within(list).getByText(/Say hello/)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "How a client gets data" })
    ).toBeInTheDocument(); // first exercise not yet passed
  });

  it("opens the first unpassed exercise, or the one named in the address", async () => {
    mocked.getLabModule.mockResolvedValue(
      detail([
        ex({
          id: "m1-e1",
          order: 1,
          title: "Done already",
          student: {
            attempts: 1,
            passed: true,
            passed_at: "x",
            hints_used: 0,
            last_attempt_at: "x",
          },
        }),
        ex(),
      ])
    );
    renderAt("/graphql-lab/modules/m1-fundamentals");
    expect(await screen.findByRole("heading", { name: "Say hello" })).toBeInTheDocument();
  });

  it("opens a lesson example in a sandbox and runs it for real", async () => {
    mocked.executeLab.mockResolvedValue(ok({ roles: [{ title: "Frontend Intern" }] }));
    renderAt("/graphql-lab/modules/m1-fundamentals");
    fireEvent.click(
      await screen.findByRole("button", { name: /Try it: Run the roles query/ })
    );
    const sandbox = await screen.findByRole("heading", { name: "Try it" });
    expect(sandbox).toBeInTheDocument();
    const editors = screen.getAllByLabelText("GraphQL query") as HTMLTextAreaElement[];
    expect(editors.some((e) => e.value.includes("roles"))).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Run query" })[0]!);
    expect(await screen.findByLabelText("Response data")).toHaveTextContent(
      "Frontend Intern"
    );
  });

  it("shows a query exercise's task, requirements, grading note and starter code", async () => {
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    expect(await screen.findByRole("heading", { name: "Say hello" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Requirements" })).toHaveTextContent(
      "Select the hello field"
    );
    expect(screen.getByText(/validated against the training schema/)).toBeInTheDocument();
    expect(
      (screen.getByLabelText("GraphQL query") as HTMLTextAreaElement).value
    ).toContain("# select a field here");
    fireEvent.click(screen.getByRole("button", { name: "Load the example" }));
    expect((screen.getByLabelText("GraphQL query") as HTMLTextAreaElement).value).toBe(
      "{\n  hello\n}"
    );
  });

  it("reports a pass only when the server says it passed, with the checks and the explanation", async () => {
    mocked.submitLab.mockResolvedValue(
      submitted({ newly_completed: { lesson: true, module: false } })
    );
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    fireEvent.click(await screen.findByRole("button", { name: "Check my answer" }));
    const result = await screen.findByLabelText("Check result");
    expect(within(result).getAllByRole("status")[0]).toHaveTextContent("Passed");
    expect(
      within(result).getByText(/Is valid GraphQL for the training schema: met/)
    ).toBeInTheDocument();
    expect(within(result).getByText("A query is a selection set.")).toBeInTheDocument();
    expect(
      within(result).getByText(/completed the lesson "Your first request"/)
    ).toBeInTheDocument();
    expect(mocked.submitLab.mock.calls[0]![0]).toBe("m1-e2");
    expect(mocked.submitLab.mock.calls[0]![1]).toMatchObject({
      client_attempt_id: expect.stringMatching(/^at_[A-Za-z0-9]{8,}$/),
      query: expect.stringContaining("select a field"),
    });
    await waitFor(() => expect(mocked.getLabModule).toHaveBeenCalledTimes(2)); // statuses refresh from the server
  });

  it("never shows 'Passed' for a failed check: it explains, nudges and links back to the lesson", async () => {
    mocked.submitLab.mockResolvedValue(
      submitted({
        outcome: "needs_improvement",
        feedback: "Your response is missing some of the requested data.",
        hint: "Select the field named in the task between the braces.",
        explanation: null,
        checks: [{ label: "Returns exactly the requested response", passed: false }],
        exercise: {
          attempts: 1,
          passed: false,
          passed_at: null,
          hints_used: 0,
          last_attempt_at: "x",
        },
      })
    );
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    fireEvent.click(await screen.findByRole("button", { name: "Check my answer" }));
    const result = await screen.findByLabelText("Check result");
    expect(within(result).getAllByRole("status")[0]).toHaveTextContent("Not yet");
    expect(within(result).queryByText(/^Passed/)).not.toBeInTheDocument();
    expect(
      within(result).getByText(/missing some of the requested data/)
    ).toBeInTheDocument();
    expect(
      within(result).getByText(/Returns exactly the requested response: not met/)
    ).toBeInTheDocument();
    expect(within(result).getByText(/Hint: Select the field named/)).toBeInTheDocument();
    expect(
      within(result).queryByText("A query is a selection set.")
    ).not.toBeInTheDocument();
    expect(
      within(result).getByRole("button", {
        name: /Review the lesson: Your first request/,
      })
    ).toBeInTheDocument();
  });

  it("retries a failed submission with the same attempt id, so it is counted once", async () => {
    mocked.submitLab
      .mockRejectedValueOnce(new ApiError("x", "GRAPHQL_LAB_UNAVAILABLE", 503))
      .mockResolvedValueOnce(submitted());
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    fireEvent.click(await screen.findByRole("button", { name: "Check my answer" }));
    expect(
      await screen.findByText(/progress could not be saved or loaded/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(await screen.findByLabelText("Check result")).toBeInTheDocument();
    expect(mocked.submitLab.mock.calls[1]![1].client_attempt_id).toBe(
      mocked.submitLab.mock.calls[0]![1].client_attempt_id
    );
  });

  it("grades choice questions, enabling Submit only once something is chosen", async () => {
    mocked.submitLab.mockResolvedValue(
      submitted({
        attempt: { ...submitted().attempt, exercise_id: "m1-e1" },
        execution: null,
      })
    );
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e1");
    const submit = await screen.findByRole("button", { name: "Submit answer" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText("One query"));
    fireEvent.click(submit);
    await screen.findByLabelText("Check result");
    expect(mocked.submitLab).toHaveBeenCalledWith("m1-e1", {
      client_attempt_id: expect.any(String),
      answer: ["b"],
    });
  });

  it("supports multi-select questions", async () => {
    mocked.getLabModule.mockResolvedValue(
      detail([
        {
          ...choiceEx,
          multi_select: true,
          options: [
            { id: "a", text: "A" },
            { id: "b", text: "B" },
            { id: "c", text: "C" },
          ],
        },
      ])
    );
    mocked.submitLab.mockResolvedValue(submitted({ execution: null }));
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e1");
    expect(await screen.findByText("Choose every correct answer")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("A"));
    fireEvent.click(screen.getByLabelText("C"));
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() =>
      expect(mocked.submitLab).toHaveBeenCalledWith(
        "m1-e1",
        expect.objectContaining({ answer: ["a", "c"] })
      )
    );
  });

  it("collects a written explanation within its limit", async () => {
    mocked.getLabModule.mockResolvedValue(detail([textEx]));
    mocked.submitLab.mockResolvedValue(submitted({ execution: null }));
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m10-e8");
    const box = await screen.findByLabelText("Your explanation");
    expect(box).toHaveAttribute("maxlength", "900");
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled();
    fireEvent.change(box, {
      target: { value: "One query for the list, then one per item." },
    });
    expect(screen.getByText("42 of 900 characters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Submit answer" }));
    await waitFor(() =>
      expect(mocked.submitLab).toHaveBeenCalledWith(
        "m10-e8",
        expect.objectContaining({ answer: "One query for the list, then one per item." })
      )
    );
  });

  it("reveals hints one at a time and stops at the last one", async () => {
    mocked.hintLab
      .mockResolvedValueOnce({
        hint: "Put a field between the braces.",
        hint_number: 1,
        hints_total: 2,
      })
      .mockResolvedValueOnce({
        hint: "The field is named like the greeting.",
        hint_number: 2,
        hints_total: 2,
      });
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    fireEvent.click(
      await screen.findByRole("button", { name: "Show a hint (0 of 2 shown)" })
    );
    expect(
      await screen.findByText("Put a field between the braces.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show a hint (1 of 2 shown)" }));
    expect(
      await screen.findByText("The field is named like the greeting.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No more hints" })).toBeDisabled();
  });

  it("offers to restore the last saved attempt", async () => {
    mocked.getLabAttempts.mockResolvedValue({
      attempts: [
        {
          id: "att",
          exercise_id: "m1-e2",
          at: "x",
          passed: false,
          query: "{ skills { name } }",
          variables: { a: 1 },
          answer: null,
          feedback: "f",
          checks: [],
        },
      ],
    });
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    fireEvent.click(await screen.findByRole("button", { name: "Load my last attempt" }));
    expect((screen.getByLabelText("GraphQL query") as HTMLTextAreaElement).value).toBe(
      "{ skills { name } }"
    );
    expect((screen.getByLabelText(/Variables/) as HTMLTextAreaElement).value).toContain(
      '"a": 1'
    );
  });

  it("asks the mentor about an exercise, and the Lab keeps working when the mentor is unavailable", async () => {
    mocked.labHelp
      .mockRejectedValueOnce(new ApiError("x", "LLM_TIMEOUT", 504))
      .mockResolvedValueOnce({
        reply: "Think about which root field greets you.",
        mock: false,
        query_status: null,
        memory_saved: [
          {
            id: "m",
            type: "learning",
            content: "Finds fragments difficult",
            provenance: "student_provided",
          },
        ],
      });
    mocked.executeLab.mockResolvedValue(ok({ hello: "Hello, GraphQL!" }));
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e2");
    fireEvent.click(await screen.findByRole("button", { name: "Give me a hint" }));
    expect(await screen.findByText(/model took too long/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Run query" })[0]!);
    expect(await screen.findByLabelText("Response data")).toHaveTextContent(
      "Hello, GraphQL!"
    );
    fireEvent.change(screen.getByLabelText("Your question (optional)"), {
      target: { value: "I find fragments hard" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Give me a hint" }));
    const answer = await screen.findByLabelText("Mentor answer");
    expect(answer).toHaveTextContent("Think about which root field greets you.");
    expect(answer).toHaveTextContent(
      "Remembered from your message: Finds fragments difficult"
    );
    expect(answer).not.toHaveTextContent("Mock mentor");
    expect(mocked.labHelp).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "hint",
        exercise_id: "m1-e2",
        message: "I find fragments hard",
      })
    );
  });

  it("disables query-based help until there is a query", async () => {
    mocked.getLabModule.mockResolvedValue(detail([choiceEx]));
    renderAt("/graphql-lab/modules/m1-fundamentals?exercise=m1-e1");
    expect(
      await screen.findByRole("button", { name: "Explain this query" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Give me a hint" })).toBeEnabled();
  });

  it("shows a retryable error when the module cannot load", async () => {
    mocked.getLabModule
      .mockRejectedValueOnce(new ApiError("x", "MODULE_NOT_FOUND", 404))
      .mockResolvedValueOnce(detail());
    renderAt("/graphql-lab/modules/m99-nope");
    expect(await screen.findByText(/That module no longer exists/)).toBeInTheDocument();
  });
});
