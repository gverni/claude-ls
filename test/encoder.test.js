import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodePath } from "../src/lib/encoder.js";

describe("encodePath", () => {
  it("replaces all slashes with dashes", () => {
    assert.equal(encodePath("/Users/foo/my-project"), "-Users-foo-my-project");
  });

  it("handles root path", () => {
    assert.equal(encodePath("/"), "-");
  });

  it("handles deeply nested path", () => {
    assert.equal(
      encodePath("/home/user/dev/org/repo"),
      "-home-user-dev-org-repo"
    );
  });

  it("preserves existing dashes in directory names", () => {
    assert.equal(
      encodePath("/Users/foo/my-cool-project"),
      "-Users-foo-my-cool-project"
    );
  });

  it("replaces dots with dashes", () => {
    assert.equal(
      encodePath("/Users/gv/dev/gverni.github.io"),
      "-Users-gv-dev-gverni-github-io"
    );
  });
});
