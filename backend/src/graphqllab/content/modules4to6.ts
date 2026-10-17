import { gql, json, list, p, rules, tryIt, type ModuleDef } from "../model.js";

export const MODULE_4: ModuleDef = {
  id: "m4-arguments-variables",
  order: 4,
  title: "Arguments and variables",
  summary: "Pass arguments to fields, then replace hard-coded values with variables so one query can be reused.",
  difficulty: "intermediate",
  prerequisites: ["m3-queries-nesting"],
  objectives: ["Use field arguments", "Declare variables with types", "Understand required and optional variables", "Reuse one document with different inputs"],
  completionCriteria: "Pass all five exercises in this module.",
  lessons: [
    {
      id: "m4-l1",
      title: "Field arguments",
      objectives: ["Read an argument in the schema", "Pass literal arguments"],
      blocks: [
        p("Fields can take arguments, written in parentheses. The schema says which arguments exist, their types, and which are required (a type ending in ! with no default). Enum values such as ENTRY are written without quotes; strings need quotes."),
        gql(`type Query {
  role(id: ID!): Role
  roles(level: Level, minPackage: Float, remote: Boolean): [Role!]!
}`),
        gql(`{
  role(id: "r2") {
    title
  }
  roles(level: ENTRY, remote: true) {
    title
  }
}`),
        tryIt("Run both", '{\n  role(id: "r2") {\n    title\n  }\n  roles(level: ENTRY, remote: true) {\n    title\n  }\n}'),
      ],
    },
    {
      id: "m4-l2",
      title: "Variables",
      objectives: ["Declare variables", "Supply variable values separately", "Use defaults"],
      blocks: [
        p("Hard-coding values makes every query unique. Variables keep the query text fixed and send the values separately as JSON. Declare each variable with a name and a type after the operation name, then use it with a dollar sign."),
        gql(`query RoleById($id: ID!) {
  role(id: $id) {
    title
    packageLpa
  }
}`),
        json(`{ "id": "r2" }`),
        list(
          "A variable type ending in ! is required: the request fails if no value (and no default) is supplied.",
          "Without ! the variable is optional. A default can be written with =, for example $minPackage: Float = 10.",
          "A value that does not fit the declared type is a variable coercion error: nothing runs.",
        ),
        p("Change the variables below and run the same query again. The query text does not change."),
        tryIt("Role by variable", "query RoleById($id: ID!) {\n  role(id: $id) {\n    title\n    packageLpa\n  }\n}", { id: "r2" }),
      ],
    },
  ],
  exercises: [
    {
      id: "m4-e1",
      lessonId: "m4-l1",
      type: "query",
      title: "One role by id",
      difficulty: "beginner",
      description: 'Fetch the role with id "r2" and return its title and packageLpa.',
      objectives: ["Pass a literal argument"],
      concepts: ["arguments"],
      requirements: ['Call role with the id "r2"', "Select title and packageLpa"],
      starter: "{\n  role {\n    title\n  }\n}",
      reference: '{ role(id: "r2") { title packageLpa } }',
      hints: ["Arguments go in parentheses right after the field name.", "A string argument needs quotes. Check the argument's name in the schema explorer."],
      explanation: "The id argument is required (ID!), so the field is invalid without it. Validation catches that before anything runs.",
      failHint: "The starter is missing the argument and one field. Check the schema for the argument's name.",
    },
    {
      id: "m4-e2",
      lessonId: "m4-l1",
      type: "query",
      title: "Filter with several arguments",
      difficulty: "intermediate",
      description: "Return the titles of all roles whose level is ENTRY and which are remote.",
      objectives: ["Combine arguments", "Write an enum value"],
      concepts: ["arguments", "enums"],
      requirements: ["Call roles with level ENTRY and remote true", "Select only each title"],
      starter: "{\n  roles {\n    title\n  }\n}",
      reference: "{ roles(level: ENTRY, remote: true) { title } }",
      hints: ["Separate arguments with commas inside the parentheses.", "Enum values are written without quotes; booleans are true or false."],
      explanation: "Filtering happens on the server, so the response contains only the roles you asked about.",
      failHint: "Use both filters in the same parentheses, with an unquoted enum value.",
    },
    {
      id: "m4-e3",
      lessonId: "m4-l2",
      type: "query",
      title: "A reusable company query",
      difficulty: "intermediate",
      description: "Write a query that takes a variable named $companyId (type ID!) and returns that company's name and city. The checker runs your query with several different values for companyId.",
      objectives: ["Declare and use a variable", "Reuse one document"],
      concepts: ["variables", "arguments"],
      requirements: ["Declare $companyId as ID!", "Return name and city of the company", "Do not hard-code the id in the query"],
      starter: "query Company {\n  company(id: \"c1\") {\n    name\n  }\n}",
      reference: "query Company($companyId: ID!) { company(id: $companyId) { name city } }",
      runs: [{ companyId: "c1" }, { companyId: "c3" }, { companyId: "c6" }],
      ast: [rules.usesVariables(), rules.noLiteralArguments()],
      hints: ["Variable declarations go in parentheses after the operation name: $name: Type.", "Use the variable where the literal value was: company(id: $...)."],
      explanation: "The same document served three different companies. Only the variables changed, which also lets servers cache and reuse a parsed query.",
      failHint: "Declare the variable on the operation and use it in the argument. The checker supplies the values.",
    },
    {
      id: "m4-e4",
      lessonId: "m4-l2",
      type: "query",
      title: "An optional variable with a default",
      difficulty: "intermediate",
      description: "Write a query with an optional variable $minPackage of type Float whose default is 10. It must return the title and packageLpa of roles with at least that package. The checker runs it once without a value and once with 20.",
      objectives: ["Use defaults", "Understand optional variables"],
      concepts: ["variables", "default-values"],
      requirements: ["Declare $minPackage as Float with a default of 10", "Return title and packageLpa for roles at or above it"],
      starter: "query Pay {\n  roles {\n    title\n  }\n}",
      reference: "query Pay($minPackage: Float = 10) { roles(minPackage: $minPackage) { title packageLpa } }",
      runs: [{}, { minPackage: 20 }],
      ast: [rules.usesVariables(), rules.noLiteralArguments()],
      hints: ["A default value is written after the type: $name: Type = value.", "Pass the variable to the argument that filters by package."],
      explanation: "When the client sends no value the default applies, so the query works both ways.",
      failHint: "Both runs must return different, correct lists: check the default and the argument you pass it to.",
    },
    {
      id: "m4-e5",
      lessonId: "m4-l2",
      type: "multiple_choice",
      title: "Required variables",
      difficulty: "beginner",
      description: "Which declaration makes the variable id required, with no default?",
      objectives: ["Read variable types"],
      concepts: ["variables", "non-null"],
      requirements: ["Choose the single best answer"],
      options: [
        { id: "a", text: "query Q($id: ID) { role(id: $id) { title } }" },
        { id: "b", text: "query Q($id: ID!) { role(id: $id) { title } }" },
        { id: "c", text: "query Q($id = ID) { role(id: $id) { title } }" },
        { id: "d", text: "query Q(id: ID!) { role(id: $id) { title } }" },
      ],
      correct: ["b"],
      hints: ["Which character marks a type as required?", "Variable names start with a dollar sign in the declaration too."],
      explanation: "$id: ID! is required. $id: ID is optional, and the other two are not valid syntax.",
      failHint: "Look for the declaration that is valid syntax and marks the type as non-null.",
    },
  ],
};

export const MODULE_5: ModuleDef = {
  id: "m5-mutations",
  order: 5,
  title: "Mutations",
  summary: "Change data with mutations against your own disposable training records.",
  difficulty: "intermediate",
  prerequisites: ["m4-arguments-variables"],
  objectives: ["Explain query versus mutation", "Write mutations with input objects", "Read mutation payloads", "Handle validation errors returned as data"],
  completionCriteria: "Pass all six exercises in this module.",
  lessons: [
    {
      id: "m5-l1",
      title: "Writing mutations",
      objectives: ["Use the Mutation root", "Pass input objects", "Select the result"],
      blocks: [
        p("Queries read data; mutations change it. The Mutation type is the entry point for writes. A mutation field usually takes an input object and returns a payload, so you can select what changed in the same request."),
        p("Your training data is private to you: you start with two applications, and every mutation changes only your own copy. You can restore it at any time with the resetTrainingData mutation or the Reset button."),
        gql(`mutation {
  applyToRole(input: { roleId: "r3", note: "Excited" }) {
    application {
      id
      status
    }
    userErrors {
      message
    }
  }
}`),
        p("Top-level mutation fields run one after another, in order. Queries may run in parallel."),
        tryIt("Apply to a role", 'mutation {\n  applyToRole(input: { roleId: "r3", note: "Excited" }) {\n    application {\n      id\n      status\n    }\n    userErrors {\n      message\n    }\n  }\n}'),
        tryIt("See your applications", "{\n  me {\n    applications {\n      id\n      status\n      role {\n        title\n      }\n    }\n  }\n}"),
      ],
    },
    {
      id: "m5-l2",
      title: "Mutation errors",
      objectives: ["Tell payload errors from GraphQL errors", "Make retries safe"],
      blocks: [
        p("Two kinds of failure exist. A GraphQL error (syntax, validation, resolver failure) appears in the top-level errors list. A problem the user can fix, such as 'you already applied', is better returned as data: this API puts it in the payload as userErrors, each with a field, a message and a code."),
        p("Mutations should be safe to retry where possible. withdrawApplication, for example, does nothing wrong if you send it twice."),
        tryIt("Apply to a role that does not exist", 'mutation {\n  applyToRole(input: { roleId: "r999" }) {\n    application {\n      id\n    }\n    userErrors {\n      field\n      code\n      message\n    }\n  }\n}'),
      ],
    },
  ],
  exercises: [
    {
      id: "m5-e1",
      lessonId: "m5-l1",
      type: "multiple_choice",
      title: "Query or mutation?",
      difficulty: "beginner",
      description: "Which operation type should be used to change a record on the server?",
      objectives: ["Choose the operation type"],
      concepts: ["mutations", "operation-types"],
      requirements: ["Choose the single best answer"],
      options: [
        { id: "a", text: "A query, because it is faster." },
        { id: "b", text: "A mutation, because writes belong to the Mutation root and run in order." },
        { id: "c", text: "Either; there is no difference." },
        { id: "d", text: "A subscription." },
      ],
      correct: ["b"],
      hints: ["Which root type is meant for side effects?"],
      explanation: "By convention queries have no side effects and mutations do. Mutation fields at the top level execute serially.",
      failHint: "Think about which root type exists specifically for writes.",
    },
    {
      id: "m5-e2",
      lessonId: "m5-l1",
      type: "mutation",
      title: "Apply to a role",
      difficulty: "intermediate",
      description: 'Apply to role "r3" with the note "Excited". In the payload return the new application\'s id, its status and its role\'s title, and the message of every userError.',
      objectives: ["Write a mutation with an input object"],
      concepts: ["mutations", "input-objects"],
      requirements: ['Call applyToRole for role "r3" with the note "Excited"', "Return application id, status and role title", "Return the message of each userError"],
      starter: 'mutation {\n  applyToRole(input: { roleId: "r3" }) {\n    application {\n      id\n    }\n  }\n}',
      reference: 'mutation { applyToRole(input: { roleId: "r3", note: "Excited" }) { application { id status role { title } } userErrors { message } } }',
      hints: ["Input objects are written with curly braces: { field: value }.", "role is an object inside the application, so it needs its own selection.", "userErrors is a list of objects: select message inside it."],
      explanation: "The payload let you read back exactly what was created. The checker ran your mutation on a scratch copy, so your real applications are unchanged until you run it in the playground.",
      failHint: "Compare the starter with each item in the task: the note, the extra fields and userErrors are missing.",
    },
    {
      id: "m5-e3",
      lessonId: "m5-l1",
      type: "mutation",
      title: "Update with variables",
      difficulty: "intermediate",
      description: "Write a mutation using the variables $id (ID!) and $input (UpdateApplicationInput!) that calls updateApplication and returns the application's id and status, plus each userError's code. The checker supplies the values.",
      objectives: ["Combine mutations and variables"],
      concepts: ["mutations", "variables", "input-objects"],
      requirements: ["Declare $id as ID! and $input as UpdateApplicationInput!", "Return the application's id and status and each userError's code", "Do not hard-code the values"],
      starter: "mutation Update {\n  updateApplication(id: \"app_1\", input: { status: INTERVIEWING }) {\n    application {\n      id\n    }\n  }\n}",
      reference: "mutation Update($id: ID!, $input: UpdateApplicationInput!) { updateApplication(id: $id, input: $input) { application { id status } userErrors { code } } }",
      runs: [{ id: "app_1", input: { status: "INTERVIEWING" } }],
      ast: [rules.usesVariables(), rules.noLiteralArguments()],
      hints: ["Variables can hold whole input objects. Give the input argument a variable of the input type.", "Look up the exact name of the input type in the schema explorer."],
      explanation: "Passing the input object as one variable keeps the mutation document static while the values change.",
      failHint: "Declare both variables with the types in the task and pass them to both arguments.",
    },
    {
      id: "m5-e4",
      lessonId: "m5-l2",
      type: "mutation",
      title: "Withdraw an application",
      difficulty: "intermediate",
      description: 'Withdraw the application with id "app_2" and return its id and new status, and the message of any userError.',
      objectives: ["Use an idempotent mutation"],
      concepts: ["mutations", "idempotency"],
      requirements: ['Call withdrawApplication with id "app_2"', "Return the application's id and status and each userError's message"],
      starter: "mutation {\n  withdrawApplication(id: \"app_2\") {\n    userErrors {\n      message\n    }\n  }\n}",
      reference: 'mutation { withdrawApplication(id: "app_2") { application { id status } userErrors { message } } }',
      hints: ["The payload has an application field too: select what you need from it."],
      explanation: "You can run this mutation twice: withdrawing an already withdrawn application changes nothing. Safe retries matter on unreliable networks.",
      failHint: "The task asks you to read the application back as well as the errors.",
    },
    {
      id: "m5-e5",
      lessonId: "m5-l2",
      type: "mutation",
      title: "Trigger a validation error",
      difficulty: "intermediate",
      description: 'Apply to the role "r999", which does not exist. Return the application\'s id, and for each userError its field and code.',
      objectives: ["Read validation errors returned as data"],
      concepts: ["mutations", "user-errors", "validation"],
      requirements: ['Call applyToRole with the roleId "r999"', "Return application id", "Return the field and code of each userError"],
      starter: 'mutation {\n  applyToRole(input: { roleId: "r3" }) {\n    application {\n      id\n    }\n  }\n}',
      reference: 'mutation { applyToRole(input: { roleId: "r999" }) { application { id } userErrors { field code } } }',
      hints: ["userErrors is part of every payload in this API, even when the call succeeds.", "Select field and code inside userErrors."],
      explanation: "Nothing was created, so application is null, and the problem came back as data a screen can show next to the right field.",
      failHint: "Change the role id as the task says and ask for userErrors with both sub-fields.",
    },
    {
      id: "m5-e6",
      lessonId: "m5-l2",
      type: "multiple_choice",
      title: "Where should 'already applied' go?",
      difficulty: "intermediate",
      description: "A student applies twice to the same role. In this API where does the failure appear?",
      objectives: ["Choose how to report a business-rule failure"],
      concepts: ["user-errors", "errors"],
      requirements: ["Choose the single best answer"],
      options: [
        { id: "a", text: "In the top-level errors list, with the whole response failing." },
        { id: "b", text: "In the payload as a userError, with the rest of the response still valid." },
        { id: "c", text: "Nowhere: the second application silently replaces the first." },
        { id: "d", text: "As an HTTP 500." },
      ],
      correct: ["b"],
      hints: ["Who can fix the problem, and how should the client show it?"],
      explanation: "Problems the user can fix are expected outcomes, so they are modelled as data. Top-level errors are for syntax, validation and unexpected failures.",
      failHint: "Run the mutation twice in the playground and see where the second response puts the problem.",
    },
  ],
};

export const MODULE_6: ModuleDef = {
  id: "m6-fragments",
  order: 6,
  title: "Fragments and reusable selections",
  summary: "Name a selection once and reuse it; use inline fragments for unions.",
  difficulty: "intermediate",
  prerequisites: ["m3-queries-nesting"],
  objectives: ["Define and spread named fragments", "Reuse a selection in several places", "Use inline fragments with unions", "Judge when fragments help"],
  completionCriteria: "Pass all four exercises in this module.",
  lessons: [
    {
      id: "m6-l1",
      title: "Named fragments",
      objectives: ["Write a fragment", "Spread it"],
      blocks: [
        p("A fragment is a named, reusable group of fields on one type. Define it once with fragment Name on Type { ... } and include it anywhere with ...Name. Fragments keep large queries readable and make sure every place shows the same fields."),
        gql(`fragment RoleCard on Role {
  title
  packageLpa
}

{
  roles {
    ...RoleCard
  }
}`),
        p("When two fields of the same name appear in one selection (for example roles twice with different arguments) you must separate them with aliases."),
        tryIt("Use a fragment", "fragment RoleCard on Role {\n  title\n  packageLpa\n}\n\n{\n  roles {\n    ...RoleCard\n  }\n}"),
      ],
    },
    {
      id: "m6-l2",
      title: "Inline fragments and unions",
      objectives: ["Query a union", "Use __typename"],
      blocks: [
        p("The search field returns a union: each result is a Company, a Role or a Skill. Ask which one it is with __typename, and select type-specific fields with inline fragments: ... on Company { name }."),
        gql(`{
  search(text: "analy") {
    __typename
    ... on Company { name }
    ... on Role { title }
  }
}`),
        tryIt("Search the hub", '{\n  search(text: "analy") {\n    __typename\n    ... on Company {\n      name\n    }\n    ... on Role {\n      title\n    }\n  }\n}'),
        p("Use fragments when a selection repeats or grows large. For a one-off short selection, writing the fields inline is clearer."),
      ],
    },
  ],
  exercises: [
    {
      id: "m6-e1",
      lessonId: "m6-l1",
      type: "query",
      title: "Your first fragment",
      difficulty: "intermediate",
      description: "Define a fragment on Role that selects title and packageLpa, and use it to list all roles.",
      objectives: ["Define and spread a fragment"],
      concepts: ["fragments"],
      requirements: ["Define a named fragment on Role with title and packageLpa", "Spread it inside roles"],
      starter: "{\n  roles {\n    title\n    packageLpa\n  }\n}",
      reference: "fragment RoleBits on Role { title packageLpa } { roles { ...RoleBits } }",
      ast: [rules.definesFragment(), rules.spreadsFragment(1)],
      hints: ["A fragment definition sits next to your query in the same document.", "Inside roles, replace the fields with ...YourFragmentName."],
      explanation: "The response is identical to the plain query: fragments change how the query is written, not what is returned.",
      failHint: "The response can be right but the document must also define and spread a fragment.",
    },
    {
      id: "m6-e2",
      lessonId: "m6-l1",
      type: "query",
      title: "One fragment, two places",
      difficulty: "intermediate",
      description: "Return two lists in one request: remoteRoles (roles that are remote) and entryRoles (roles of level ENTRY). Both must show title and packageLpa through the same fragment.",
      objectives: ["Reuse a fragment", "Combine aliases and fragments"],
      concepts: ["fragments", "aliases"],
      requirements: ["Return remoteRoles and entryRoles", "Select title and packageLpa through one named fragment"],
      starter: "{\n  roles(remote: true) {\n    title\n  }\n}",
      reference: "fragment RoleBits on Role { title packageLpa } { remoteRoles: roles(remote: true) { ...RoleBits } entryRoles: roles(level: ENTRY) { ...RoleBits } }",
      ast: [rules.definesFragment(), rules.spreadsFragment(2), rules.usesAlias()],
      hints: ["Two fields with the same name need aliases.", "If the field list changes later you should have to edit it in one place only."],
      explanation: "If the cards ever need another field, you now change one fragment instead of two selections.",
      failHint: "Check the two response keys, and that both lists use the same fragment.",
    },
    {
      id: "m6-e3",
      lessonId: "m6-l2",
      type: "query",
      title: "Search a union",
      difficulty: "advanced",
      description: 'Search for the text "analy". For each result return its __typename; for companies also the name and city, and for roles the title and packageLpa.',
      objectives: ["Query a union with inline fragments"],
      concepts: ["unions", "inline-fragments"],
      requirements: ['Call search with the text "analy"', "Select __typename", "Use inline fragments for Company and Role"],
      starter: '{\n  search(text: "analy") {\n    __typename\n  }\n}',
      reference: '{ search(text: "analy") { __typename ... on Company { name city } ... on Role { title packageLpa } } }',
      ast: [rules.usesInlineFragment(), rules.asksTypename()],
      hints: ["You cannot select name on a union directly: pick the type first with ... on TypeName.", "Add one inline fragment per type the task mentions."],
      explanation: "A union has no fields of its own, so every type-specific field goes through an inline fragment.",
      failHint: "Each inline fragment names a type and selects that type's fields.",
    },
    {
      id: "m6-e4",
      lessonId: "m6-l2",
      type: "multiple_choice",
      title: "When fragments help",
      difficulty: "intermediate",
      description: "Which situations make a fragment a good idea? Pick all that apply.",
      objectives: ["Judge when to use fragments"],
      concepts: ["fragments"],
      requirements: ["Choose every correct answer"],
      multi: true,
      options: [
        { id: "a", text: "The same group of fields is selected in several places." },
        { id: "b", text: "A selection is large enough that naming it makes the query easier to read." },
        { id: "c", text: "You want the server to cache the field values between requests." },
        { id: "d", text: "A union needs type-specific fields." },
      ],
      correct: ["a", "b", "d"],
      hints: ["Fragments are about how a query is written, not about server behaviour."],
      explanation: "Fragments remove repetition and name large selections, and inline fragments are required for union members. They do not change caching or what the server does.",
      failHint: "Decide for each option whether it is about readability and reuse, or about something fragments do not do.",
    },
  ],
};
