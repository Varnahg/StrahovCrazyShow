import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getLocale, setLocale } from "../client/i18n";

test("the immediate form is accessible in Czech and English without capturing or uploading during render", async () => {
  const hooks = registerHooks({
    load(url, context, next) {
      return url.endsWith(".css")
        ? { format: "module", source: "export default {}", shortCircuit: true }
        : next(url, context);
    },
  });
  const previous = getLocale();
  try {
    const { FeedbackDialog } = await import("../client/feedback");
    let captures = 0;
    const props = {
      open: true,
      onClose() {},
      getContext: () => ({
        clientBuildId: "test",
        mode: "menu" as const,
        page: "menu" as const,
        locale: getLocale(),
      }),
      capture: async () => {
        captures++;
        return { capture: { state: "unavailable" as const }, image: null };
      },
    };
    for (const locale of ["cs", "en"] as const) {
      setLocale(locale);
      const html = renderToStaticMarkup(createElement(FeedbackDialog, props));
      assert.match(html, /<dialog[^>]+aria-labelledby=/);
      assert.match(html, /aria-modal="true"/);
      assert.match(html, /<textarea[^>]+required=""/);
      assert.match(html, /<textarea[^>]+autofocus=""/i);
      assert.match(html, /type="email"/);
      assert.match(html, /<details>/);
      assert.match(html, /role="status"/);
      assert.match(
        html,
        locale === "cs" ? /Připravuji snímek/ : /Preparing the image/,
      );
      assert.match(html, locale === "cs" ? /Zpětná vazba/ : /Feedback/);
      assert.match(html, /type="submit"[^>]+disabled=""/);
      assert.equal((html.match(/required=""/g) ?? []).length, 1);
    }
    assert.equal(captures, 0);
    assert.equal(
      renderToStaticMarkup(
        createElement(FeedbackDialog, { ...props, open: false }),
      ),
      "",
    );
  } finally {
    setLocale(previous);
    hooks.deregister();
  }
});
