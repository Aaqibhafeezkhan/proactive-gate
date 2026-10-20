// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import { readFileSync } from "node:fs";

/** The one sentence every surface uses; `test/category.test.mjs` checks the others against the same file. */
const CATEGORY = readFileSync(new URL("../category-sentence.txt", import.meta.url), "utf8").trim();

const SITE = "https://bubblegunn.github.io/proactive-gate";
const OG_ALT =
  "Two real decisions from the example day: candidate a1 not delivered, rejectedBy quietHours; candidate a5 delivered on push and feed after thirteen checks.";

export default defineConfig({
  site: "https://bubblegunn.github.io",
  base: "/proactive-gate",
  integrations: [
    starlight({
      title: "proactive-gate",
      description: CATEGORY,
      // Every link to this project rendered a blank card: the theme declares
      // twitter:card=summary_large_image but no image existed, so Hacker News, Reddit, X, Slack
      // and LinkedIn all had nothing to show. The card is generated from real replay output by
      // `npm run og`, so it cannot drift into being a slogan about decisions.
      head: [
        { tag: "meta", attrs: { property: "og:image", content: `${SITE}/og.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: OG_ALT } },
        { tag: "meta", attrs: { name: "twitter:image", content: `${SITE}/og.png` } },
        { tag: "meta", attrs: { name: "twitter:image:alt", content: OG_ALT } },
      ],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/Bubblegunn/proactive-gate" }],
      editLink: { baseUrl: "https://github.com/Bubblegunn/proactive-gate/edit/main/docs/site/" },
      sidebar: [
        { label: "Start", slug: "start" },
        { label: "Decisions", slug: "decisions" },
        { label: "Simulate", slug: "simulate" },
        { label: "Checks", slug: "checks" },
        { label: "Policy as data", slug: "policy" },
        { label: "Test your own policy", slug: "testing" },
        { label: "Presets", slug: "presets" },
        { label: "Adapters", slug: "adapters" },
        { label: "Integrations", slug: "integrations" },
        { label: "Python", slug: "python" },
        { label: "Spec and conformance", slug: "spec" },
        { label: "Playground", link: "/playground/" },
        { label: "Replay two policies", link: "/replay/" },
      ],
      plugins: [
        starlightLlmsTxt({
          projectName: "proactive-gate",
          description: CATEGORY,
          details:
            "Install with npm install proactive-gate, pip install proactive-gate or go get github.com/Bubblegunn/proactive-gate/go. The library decides and never sends a message. The README states what it cannot do; quote it rather than inferring more.",
          promote: ["index*", "start*", "faq*"],
        }),
      ],
    }),
  ],
});
