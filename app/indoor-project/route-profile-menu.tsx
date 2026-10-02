import { useId } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Accessibility, Check, ChevronDown, Footprints } from "lucide-react";

const profiles = [
  {
    value: "public" as const,
    name: "Public review",
    description: "Includes areas awaiting access review",
    Icon: Footprints,
  },
  {
    value: "accessible" as const,
    name: "Confirmed step-free route",
    description: "Uses confirmed connections without stairs",
    Icon: Accessibility,
  },
];

export function ProjectRouteProfileMenu({
  mode,
  onChange,
  label = "Route profile",
}: {
  mode: "public" | "accessible";
  onChange: (mode: "public" | "accessible") => void;
  label?: string;
}) {
  const id = useId();
  const profile = profiles.find((entry) => entry.value === mode)!;
  return (
    <div className="project-profile-field">
      <label htmlFor={id}>{label}</label>
      <Menu.Root modal={false}>
        <Menu.Trigger asChild>
          <button
            id={id}
            type="button"
            aria-label={label}
            className="project-profile-trigger"
          >
            <profile.Icon size={18} aria-hidden="true" />
            <span>{profile.name}</span>
            <ChevronDown size={17} aria-hidden="true" />
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            aria-labelledby={id}
            className="project-profile-menu"
            align="start"
            sideOffset={8}
            collisionPadding={12}
          >
            <Menu.RadioGroup
              value={mode}
              onValueChange={(value) => onChange(value as typeof mode)}
            >
              {profiles.map(({ value, name, description, Icon }) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  aria-label={name}
                  className="project-profile-option"
                >
                  <Icon size={19} aria-hidden="true" />
                  <span>
                    <strong>{name}</strong>
                    <small>{description}</small>
                  </span>
                  <Menu.ItemIndicator>
                    <Check size={18} />
                  </Menu.ItemIndicator>
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
