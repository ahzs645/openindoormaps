import { useId } from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, DoorOpen } from "lucide-react";
import { arrivalChoices, type ProjectArrivalMode } from "./route-arrival";
export function ProjectRouteArrivalMenu({
  mode,
  onChange,
  reasons = {},
}: {
  mode: ProjectArrivalMode;
  onChange: (mode: ProjectArrivalMode) => void;
  reasons?: Partial<Record<ProjectArrivalMode, string>>;
}) {
  const id = useId();
  return (
    <div className="project-profile-field">
      <label htmlFor={id}>Stop directions</label>
      <Menu.Root modal={false}>
        <Menu.Trigger asChild>
          <button
            id={id}
            type="button"
            aria-label="Stop directions"
            className="project-profile-trigger"
          >
            <DoorOpen size={18} aria-hidden="true" />
            <span>{arrivalChoices.find((c) => c.value === mode)!.name}</span>
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
              onValueChange={(value) => onChange(value as ProjectArrivalMode)}
            >
              {arrivalChoices.map(({ value, name, description }) => (
                <Menu.RadioItem
                  key={value}
                  value={value}
                  aria-label={name}
                  disabled={!!reasons[value] && mode !== value}
                  className="project-profile-option"
                >
                  <DoorOpen size={19} aria-hidden="true" />
                  <span>
                    <strong>{name}</strong>
                    <small>{reasons[value] ?? description}</small>
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
