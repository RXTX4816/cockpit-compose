import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { HistoryDatalist } from "./HistoryDatalist";

describe("HistoryDatalist", () => {
  it("renders a datalist with the given id", () => {
    const { container } = render(<HistoryDatalist id="rm-history" history={[]} />);
    expect(container.querySelector("datalist#rm-history")).toBeInTheDocument();
  });

  it("renders one option per history entry", () => {
    const { container } = render(<HistoryDatalist id="rm-history" history={["a", "b", "c"]} />);
    const options = container.querySelectorAll("option");
    expect(options).toHaveLength(3);
    expect([...options].map(o => o.value)).toEqual(["a", "b", "c"]);
  });
});
