import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

export function Switch({
  className = "",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>): React.JSX.Element {
  return (
    <SwitchPrimitive.Root className={`baiak-switch ${className}`} {...props}>
      <SwitchPrimitive.Thumb className="baiak-switch-thumb" />
    </SwitchPrimitive.Root>
  );
}