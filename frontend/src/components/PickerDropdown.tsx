import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type PickerOption = {
  value: string;
  label: string;
};

type PickerDropdownProps = {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyLabel?: string;
};

export function PickerDropdown({
  value,
  options,
  onChange,
  placeholder,
  emptyLabel = "No values available",
}: PickerDropdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  return (
    <div ref={rootRef} className="picker-dropdown">
      <button
        type="button"
        className={cn("picker-dropdown__trigger", open && "picker-dropdown__trigger--open")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn("picker-dropdown__value", !selectedOption && "picker-dropdown__value--placeholder")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown size={14} className={cn("picker-dropdown__chevron", open && "picker-dropdown__chevron--open")} />
      </button>

      {open ? (
        <div className="picker-dropdown__menu" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!value}
            className={cn("picker-dropdown__option", !value && "picker-dropdown__option--active")}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span>{placeholder}</span>
            {!value ? <Check size={14} /> : null}
          </button>

          {options.length ? (
            options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  className={cn("picker-dropdown__option", isSelected && "picker-dropdown__option--active")}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected ? <Check size={14} /> : null}
                </button>
              );
            })
          ) : (
            <div className="picker-dropdown__empty">{emptyLabel}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
