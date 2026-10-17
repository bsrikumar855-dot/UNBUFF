import React, { useState } from "react";
import { Link } from "react-router-dom";
import { HelpPanel } from "@/components/graphqllab/HelpPanel";
import { QueryWorkbench } from "@/components/graphqllab/QueryWorkbench";
import { useLabSchema } from "@/hooks/useLabSchema";
import { routes } from "@/lib/routes";

const STARTER =
  "{\n  roles(remote: true) {\n    title\n    company {\n      name\n    }\n  }\n}";

/** A free playground against the same training API as the exercises. Nothing here is graded or counted. */
const GraphqlPlaygroundPage: React.FC = () => {
  const { schema, error, retry } = useLabSchema();
  const [query, setQuery] = useState(STARTER);
  const [variables, setVariables] = useState("");
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-muted">
        <Link to={routes.graphqlLab} className="underline">
          GraphQL Lab
        </Link>{" "}
        / Playground
      </nav>
      <h1 className="text-2xl font-bold text-ink-primary">GraphQL playground</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-ink-secondary">
        Write any query or mutation for the training schema and run it. Mutations change
        only your own copy of the training data, and you can reset it any time. Runs here
        are not graded.
      </p>
      <QueryWorkbench
        query={query}
        onQueryChange={setQuery}
        variablesText={variables}
        onVariablesChange={setVariables}
        starter={{ query: STARTER, variables: "" }}
        schema={schema}
        schemaError={error}
        onRetrySchema={retry}
      />
      <div className="mt-6">
        <HelpPanel query={query} variablesText={variables} />
      </div>
    </div>
  );
};

export default GraphqlPlaygroundPage;
