import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, TextInput } from "@patternfly/react-core";

/**
 * Regression guard for #277, pinning PatternFly behaviour rather than our own code.
 *
 * Up to @patternfly/react-core 6.6.1, `Modal.toggleSiblingsFromScreenReaders()` set
 * `aria-hidden` on every child of `document.body` except the one matching *that modal
 * instance's own* backdropId, and `componentDidUpdate` re-ran the sweep on every render
 * while open. With two modals mounted, each sweep hid the other's backdrop — so when
 * the outer modal re-rendered (which it does on every keystroke, since it owns the
 * nested modal's input state) it hid the inner modal that was actually on top.
 *
 * The dialog stayed visible and clickable but vanished from the accessibility tree:
 * invisible to screen readers, and to any role-based query. 6.6.2 fixed it upstream
 * (patternfly/patternfly-react#12422) by tracking a stack of open modals per target and
 * only hiding the ones below the top.
 *
 * These tests use plain PatternFly with no plugin code, so they fail if the dependency
 * is ever downgraded below 6.6.2 or the upstream fix regresses.
 */
function backdrops() {
  return Array.from(document.querySelectorAll<HTMLElement>(".pf-v6-c-backdrop"));
}

/** The last backdrop in the DOM is the modal on top. */
function topBackdrop() {
  const all = backdrops();
  return all[all.length - 1];
}

/** Outer modal owning the nested modal's input state — the YamlModal shape. */
function NestedModals() {
  const [filename, setFilename] = useState("");
  return (
    <Modal isOpen variant="large" aria-label="outer">
      <ModalHeader title="Outer" />
      <ModalBody>
        <Modal isOpen variant="small" aria-label="inner">
          <ModalHeader title="Inner" />
          <ModalBody>
            <TextInput aria-label="Filename" value={filename} onChange={(_e, v) => setFilename(v)} />
          </ModalBody>
          {/* focus-trap requires a tabbable node; real modals always have one. */}
          <ModalFooter><Button>Create file</Button></ModalFooter>
        </Modal>
      </ModalBody>
      {/* The outer modal needs its own tabbable node too — the inner Modal portals
          out of this subtree, so it doesn't count towards the outer focus trap. */}
      <ModalFooter><Button>Save</Button></ModalFooter>
    </Modal>
  );
}

afterEach(cleanup);

describe("nested modal accessibility (#277)", () => {
  it("keeps the topmost modal in the accessibility tree while typing", () => {
    render(<NestedModals />);
    expect(topBackdrop().getAttribute("aria-hidden")).toBeNull();

    // The keystroke that used to hide the dialog the user is typing into.
    fireEvent.change(screen.getByLabelText("Filename"), { target: { value: "extra.yml" } });
    expect(topBackdrop().getAttribute("aria-hidden")).toBeNull();

    // And still after a second one — the sweep re-ran on every render.
    fireEvent.change(screen.getByLabelText("Filename"), { target: { value: "extra.yaml" } });
    expect(topBackdrop().getAttribute("aria-hidden")).toBeNull();
  });

  it("keeps the nested dialog reachable by role after typing", () => {
    render(<NestedModals />);
    fireEvent.change(screen.getByLabelText("Filename"), { target: { value: "extra.yml" } });

    // This is what the e2e specs actually depend on: getByRole resolving inside
    // the dialog after its input has been filled.
    expect(screen.getByRole("button", { name: "Create file" })).toBeInTheDocument();
  });

  it("still hides the modals underneath the top one", () => {
    render(<NestedModals />);
    fireEvent.change(screen.getByLabelText("Filename"), { target: { value: "x" } });

    const all = backdrops();
    expect(all.length).toBeGreaterThan(1);
    for (const b of all.slice(0, -1)) {
      expect(b.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("leaves a single modal alone", () => {
    function Single() {
      const [v, setV] = useState("");
      return (
        <Modal isOpen variant="small" aria-label="only">
          <ModalHeader title="Only" />
          <ModalBody>
            <TextInput aria-label="Name" value={v} onChange={(_e, nv) => setV(nv)} />
          </ModalBody>
          <ModalFooter><Button>Save</Button></ModalFooter>
        </Modal>
      );
    }
    render(<Single />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "abc" } });
    expect(topBackdrop().getAttribute("aria-hidden")).toBeNull();
  });
});
