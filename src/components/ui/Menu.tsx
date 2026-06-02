// Thin wrappers around @radix-ui/react-dropdown-menu so consumers use our class names + tokens.

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import "./ui.css";

export const Menu = DropdownMenu.Root;
export const MenuPortal = DropdownMenu.Portal;

export function MenuTrigger(props: React.ComponentProps<typeof DropdownMenu.Trigger>) {
  const { className = "", ...rest } = props;
  return <DropdownMenu.Trigger {...rest} className={`ui-menu__trigger ${className}`} />;
}

export function MenuContent(props: React.ComponentProps<typeof DropdownMenu.Content>) {
  const { className = "", sideOffset = 0, align = "start", ...rest } = props;
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        {...rest}
        sideOffset={sideOffset}
        align={align}
        className={`ui-menu__content ${className}`}
      />
    </DropdownMenu.Portal>
  );
}

export function MenuItem(
  props: React.ComponentProps<typeof DropdownMenu.Item> & { shortcut?: string; danger?: boolean },
) {
  const { className = "", shortcut, danger, children, ...rest } = props;
  return (
    <DropdownMenu.Item
      {...rest}
      className={`ui-menu__item ${danger ? "ui-menu__item--danger" : ""} ${className}`}
    >
      <span>{children}</span>
      {shortcut && <span className="ui-menu__shortcut">{shortcut}</span>}
    </DropdownMenu.Item>
  );
}

export function MenuLabel(props: React.ComponentProps<typeof DropdownMenu.Label>) {
  const { className = "", ...rest } = props;
  return <DropdownMenu.Label {...rest} className={`ui-menu__label ${className}`} />;
}

export function MenuSeparator(props: React.ComponentProps<typeof DropdownMenu.Separator>) {
  const { className = "", ...rest } = props;
  return <DropdownMenu.Separator {...rest} className={`ui-menu__sep ${className}`} />;
}

export function MenuSub(props: React.ComponentProps<typeof DropdownMenu.Sub>) {
  return <DropdownMenu.Sub {...props} />;
}

export function MenuSubTrigger(props: React.ComponentProps<typeof DropdownMenu.SubTrigger>) {
  const { className = "", children, ...rest } = props;
  return (
    <DropdownMenu.SubTrigger {...rest} className={`ui-menu__item ${className}`}>
      <span>{children}</span>
      <span className="ui-menu__shortcut">▸</span>
    </DropdownMenu.SubTrigger>
  );
}

export function MenuSubContent(props: React.ComponentProps<typeof DropdownMenu.SubContent>) {
  const { className = "", ...rest } = props;
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.SubContent {...rest} className={`ui-menu__content ${className}`} />
    </DropdownMenu.Portal>
  );
}
