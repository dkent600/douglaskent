import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, describe } from "node:test";

import { createServer } from "vite";

/**
 * What the JSON-LD graph is supposed to be, asserted against the real `src/static/resume.json`.
 *
 * `node --test` and `node:assert/strict`, deliberately: this project has no test framework and
 * the decision to adopt one is still open, so these assertions buy no dependency and no config.
 * That constrains the style -- no mocking, no fixtures, no snapshots -- which suits what is being
 * checked here. The graph is a pure function of one JSON file, so exercising it needs nothing but
 * the file and the function.
 *
 * `buildPersonJsonLd` is TypeScript, and Node cannot import a `.ts` module directly. Rather than
 * restructure the plugin to suit the test, the test borrows Vite's own loader -- `ssrLoadModule`
 * compiles the module exactly as the build does, so what is asserted here is what ships.
 *
 * COUNTS: anything that tracks resume *content* is derived from `resume.json` inside the test, so
 * editing the resume does not present as a test failure. Only structural invariants -- one node
 * per employer however many roles reference it, no dangling `@id`, no property that schema.org
 * does not define -- are written as literals, because those are the things that must not change
 * no matter what Doug writes.
 */
const RESUME_PATH = "src/static/resume.json";
const STANDALONE_PATH = "src/static/resume-json-ld.json";
const BUILT_HTML_PATH = "dist/index.html";

let resume;
let block;
let graph;
let buildPersonJsonLd;

const nodesOfType = (type) => graph.filter((node) => node["@type"] === type);
const single = (type) => {
  const found = nodesOfType(type);
  assert.equal(found.length, 1, `expected exactly one ${type} node`);
  return found[0];
};

/**
 * The entries the graph is built from, recomputed here from the source rather than imported, so
 * the test and the plugin agree by arriving at the same answer independently rather than by
 * sharing a mistake.
 */
const publishedEntries = () => (resume.work ?? []).filter((entry) => entry.showOnShort === true);

before(async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
  try {
    ({ buildPersonJsonLd } = await server.ssrLoadModule("/resume-jsonld-plugin.ts"));
  } finally {
    await server.close();
  }

  resume = JSON.parse(readFileSync(RESUME_PATH, "utf8"));
  block = buildPersonJsonLd(resume);
  graph = block["@graph"];
});

describe("buildPersonJsonLd", () => {
  test("is pure: the same input builds the same output", () => {
    assert.deepEqual(buildPersonJsonLd(resume), block);
  });

  test("emits a @graph rather than a bare Person", () => {
    assert.equal(block["@context"], "https://schema.org");
    assert.ok(Array.isArray(graph), "@graph must be an array");
    assert.equal(block["@type"], undefined, "the document itself is not typed; its nodes are");
  });

  test("publishes one OrganizationRole per published employment entry", () => {
    const expected = publishedEntries().filter((entry) => entry.personal !== true).length;
    assert.equal(single("Person").worksFor.length, expected);
  });

  test("publishes one SoftwareApplication per published personal entry", () => {
    const expected = publishedEntries().filter((entry) => entry.personal === true).length;
    assert.equal(nodesOfType("SoftwareApplication").length, expected);
  });

  test("publishes one Organization per distinct employer website", () => {
    const expected = new Set(
      publishedEntries()
        .filter((entry) => entry.personal !== true)
        .map((entry) => entry.website),
    ).size;
    assert.equal(nodesOfType("Organization").length, expected);
  });

  /**
   * The invariant the `@id` scheme exists for, and the one a nested shape could not hold: an
   * employer named by two roles is one node, not two. Written structurally rather than as
   * "Microsoft" so it keeps working when the published set changes.
   */
  test("an employer with several roles is one node referenced several times", () => {
    const person = single("Person");
    for (const node of nodesOfType("Organization")) {
      const referencing = person.worksFor.filter((role) => role.worksFor["@id"] === node["@id"]);
      assert.ok(referencing.length >= 1, `${node.name} is in the graph but no role references it`);
    }
    const roleTargets = person.worksFor.map((role) => role.worksFor["@id"]);
    assert.equal(new Set(roleTargets).size, nodesOfType("Organization").length);
    assert.ok(
      roleTargets.length >= new Set(roleTargets).size,
      "roles are never merged: there are at least as many roles as organizations",
    );
  });

  test("Person.skills is the deduped union of the published entries' own skills", () => {
    const expected = [...new Set(publishedEntries().flatMap((entry) => entry.skills ?? []))];
    assert.deepEqual(single("Person").skills, expected);
  });

  test("knowsAbout is areasOfExpertise, in source order and uncapped", () => {
    assert.deepEqual(single("Person").knowsAbout, resume.areasOfExpertise);
  });

  test("hasCreated appears nowhere: it is not a schema.org property", () => {
    assert.ok(!JSON.stringify(block).includes("hasCreated"));
  });

  test("hasOccupation carries no skills: areasOfExpertise has one home", () => {
    assert.ok(!("skills" in single("Person").hasOccupation));
  });

  /**
   * The failure mode the whole linked shape exists to prevent. Every `{"@id": ...}` that is a
   * reference rather than a node's own identity must resolve to a node in the graph.
   */
  test("every @id reference resolves to a node in the graph", () => {
    const ids = new Set(graph.map((node) => node["@id"]));
    const references = [];

    const walk = (value, path) => {
      if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
      if (value === null || typeof value !== "object") return;
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === "@id") return references.push([path, value["@id"]]);
      for (const [key, item] of Object.entries(value)) if (key !== "@id") walk(item, `${path}.${key}`);
    };
    walk(graph, "@graph");

    assert.ok(references.length > 0, "a graph with no references is not a graph");
    assert.deepEqual(
      references.filter(([, id]) => !ids.has(id)),
      [],
      "dangling @id reference",
    );
  });

  test("an open-ended role omits endDate rather than writing 'present'", () => {
    const endDates = JSON.stringify(block).match(/"endDate":"[^"]*"/g) ?? [];
    assert.deepEqual(
      endDates.filter((entry) => /present/i.test(entry)),
      [],
    );
    const openEnded = publishedEntries().filter((entry) => /^(present|current|now|ongoing)$/i.test(entry.endDate ?? ""));
    for (const entry of openEnded) {
      const json = JSON.stringify(block);
      assert.ok(json.includes(entry.startDate), `${entry.company} should still carry its startDate`);
    }
  });
});

/**
 * The two emitted copies. These read build output, so they assert what was last built rather than
 * what the source currently says -- run `npm run build` first. The escaping asymmetry is the point:
 * the inlined copy is inside a `<script>` and must not be closable by its own content, and the
 * standalone file is not in HTML and needs no such guard.
 */
describe("emitted copies", () => {
  test("the standalone file matches the function's output", () => {
    const standalone = JSON.parse(readFileSync(STANDALONE_PATH, "utf8"));
    assert.deepEqual(standalone, block);
  });

  test("the standalone file carries no HTML escaping", () => {
    assert.ok(!readFileSync(STANDALONE_PATH, "utf8").includes("\\u003c"));
  });

  test("the inlined copy is escaped, parses, and equals the standalone copy", () => {
    const html = readFileSync(BUILT_HTML_PATH, "utf8");
    const found = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(found, "no ld+json block in the built index.html");

    const inline = found[1];
    assert.ok(!inline.includes("</script"), "the inlined copy must not be able to close its own tag");
    assert.deepEqual(JSON.parse(inline), block);
  });
});
