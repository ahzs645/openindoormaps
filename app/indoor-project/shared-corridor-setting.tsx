export function SharedCorridorSetting({
  available,
  enabled,
  onChange,
}: {
  available: boolean;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  if (!available) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      Use hallway centerlines
    </label>
  );
}
