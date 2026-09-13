import * as React from "react";
import markSource from "../assets/leviticus-mark.svg?raw";

const markPath = /<path\s+d="([^"]+)"/i.exec(markSource)?.[1] ?? "";

/** Renders the supplied Leviticus mark inline, keeping the userscript self-contained. */
export function LeviticusMark({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d={markPath} />
    </svg>
  );
}
