import { createLucideIcon } from "lucide-react-upstream";

/** BlueCode: Capy draws the open sidebar as Lucide's panel-left with its pane filled. */
export const PanelLeftFilled = createLucideIcon("panel-left-filled", [
  ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", key: "frame" }],
  ["path", { d: "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4z", fill: "currentColor", key: "pane" }],
]);
