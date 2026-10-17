import { monaco } from "@/components/code/monacoSetup";

/**
 * GraphQL syntax highlighting for the existing Monaco build (no second editor library). Monaco ships no GraphQL
 * language, so this is a small tokenizer for the GraphQL language itself: keywords, variables, directives, type names,
 * strings, numbers and comments, with bracket matching, auto-closing pairs and `#` comment toggling.
 */
export const GRAPHQL_LANGUAGE_ID = "graphql";

let registered = false;

export function registerGraphqlLanguage(): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({
    id: GRAPHQL_LANGUAGE_ID,
    aliases: ["GraphQL", "gql"],
    extensions: [".graphql", ".gql"],
  });
  monaco.languages.setLanguageConfiguration(GRAPHQL_LANGUAGE_ID, {
    comments: { lineComment: "#" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"', notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.setMonarchTokensProvider(GRAPHQL_LANGUAGE_ID, {
    keywords: [
      "query",
      "mutation",
      "subscription",
      "fragment",
      "on",
      "type",
      "input",
      "enum",
      "union",
      "interface",
      "scalar",
      "schema",
      "extend",
      "implements",
      "directive",
      "repeatable",
    ],
    constants: ["true", "false", "null"],
    tokenizer: {
      root: [
        [/#.*$/, "comment"],
        [/"""/, { token: "string", next: "@blockString" }],
        [/"/, { token: "string", next: "@string" }],
        [/\$[_A-Za-z][_0-9A-Za-z]*/, "variable"],
        [/@[_A-Za-z][_0-9A-Za-z]*/, "annotation"],
        [/-?\d+(\.\d+)?([eE][+-]?\d+)?/, "number"],
        [/\.\.\./, "operators"],
        [/[{}()[\]]/, "@brackets"],
        [/[!:=|&]/, "operators"],
        [
          /[_A-Za-z][_0-9A-Za-z]*/,
          {
            cases: {
              "@keywords": "keyword",
              "@constants": "constant",
              "[A-Z].*": "type",
              "@default": "identifier",
            },
          },
        ],
        [/[ \t\r\n,]+/, "white"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string", next: "@pop" }],
      ],
      blockString: [
        [/[^"]+/, "string"],
        [/"""/, { token: "string", next: "@pop" }],
        [/"/, "string"],
      ],
    },
  } as monaco.languages.IMonarchLanguage);
}
