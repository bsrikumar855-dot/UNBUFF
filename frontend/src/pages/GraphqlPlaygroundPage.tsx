import React, { useState } from "react";
import { HelpPanel } from "@/components/graphqllab/HelpPanel";
import { QueryWorkbench } from "@/components/graphqllab/QueryWorkbench";
import { useLabSchema } from "@/hooks/useLabSchema";
import { Page, PageHeader } from "@/components/ui/Page";
import { routes } from "@/lib/routes";

const STARTER =
  "{\n  roles(remote: true) {\n    title\n    company {\n      name\n    }\n  }\n}";

/** A free playground against the same training API as the exercises. Nothing here is graded or counted. */
const GraphqlPlaygroundPage: React.FC = () => {
  const { schema, error, retry } = useLabSchema();
  const [query, setQuery] = useState(STARTER);
  const [variables, setVariables] = useState("");
  return (
    <Page width="wide">
      <PageHeader
        crumbs={[
          { label: "GraphQL Lab", to: routes.graphqlLab },
          { label: "Playground" },
        ]}
        eyebrow="Learn"
        title="GraphQL playground"
        description="Write any query or mutation for the training schema and run it. Mutations change only your own copy of the training data, and you can reset it any time. Runs here are not graded."
      />
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
    </Page>
  );
};

export default GraphqlPlaygroundPage;
