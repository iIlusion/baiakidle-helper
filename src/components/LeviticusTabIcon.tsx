import * as React from "react";
import { LeviticusMark } from "./LeviticusMark";

export function LeviticusTabIcon(): React.JSX.Element {
  return (
    <span className="baiak-control-icon" aria-hidden="true">
      <LeviticusMark />
    </span>
  );
}
