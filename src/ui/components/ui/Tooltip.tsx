// Tooltip wrapper. Wrap app once in TooltipProvider; use <Tip label="..."> around any trigger.

import * as RTooltip from "@radix-ui/react-tooltip";
import "./ui.css";

export const TooltipProvider = RTooltip.Provider;

interface TipProps {
  label: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  shortcut?: string;
}

export function Tip({ label, children, side = "bottom", shortcut }: TipProps) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="ui-tooltip" side={side} sideOffset={6}>
          <span>{label}</span>
          {shortcut && <span className="ui-tooltip__shortcut">{shortcut}</span>}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
