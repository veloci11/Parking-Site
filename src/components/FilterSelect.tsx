"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export default function FilterSelect({
  label,
  value,
  onChange,
  options,
  variant = "chip",
  applied = false,
  hint,
  disabled = false,
  id: suppliedId,
  name,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  variant?: "chip" | "field" | "sort";
  applied?: boolean;
  hint?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
}) {
  const generatedId = useId(),
    id = suppliedId || generatedId,
    button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [position, setPosition] = useState({
      left: 16,
      top: 0,
      width: 248,
      maxHeight: 360,
    });
  const query = useRef({ text: "", at: 0 });
  function place() {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(Math.max(248, rect.width), window.innerWidth - 32);
    const height = Math.min(360, options.length * 48 + (hint ? 112 : 84));
    const above =
      window.innerHeight - rect.bottom < Math.min(height, 240) &&
      rect.top > height;
    const top = above ? Math.max(16, rect.top - height - 8) : rect.bottom + 8;
    setPosition({
      left: Math.min(Math.max(16, rect.left), window.innerWidth - width - 16),
      top,
      width,
      maxHeight: Math.max(120, Math.min(360, window.innerHeight - top - 16)),
    });
  }
  function show() {
    if (disabled || !options.some((option) => !option.disabled)) return;
    place();
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  }
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) button.current?.focus({ preventScroll: true });
  }
  function choose(index: number) {
    if (!options[index] || options[index].disabled || disabled) return;
    onChange(options[index].value);
    close(true);
  }
  useEffect(() => {
    if (!open) return;
    menu.current?.focus({ preventScroll: true });
    const pointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !menu.current?.contains(target))
        close();
    };
    const reposition = () => place();
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      close(true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
      return;
    }
    const movement =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (movement) {
      event.preventDefault();
      setActive((index) => {
        for (let offset = 1; offset <= options.length; offset++) {
          const next =
            (index + movement * offset + options.length) % options.length;
          if (!options[next]?.disabled) return next;
        }
        return index;
      });
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const indexes = options
        .map((_, index) => index)
        .filter((index) => !options[index].disabled);
      setActive((event.key === "Home" ? indexes[0] : indexes.at(-1)) ?? 0);
      return;
    }
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      query.current = {
        text:
          (now - query.current.at < 700 ? query.current.text : "") +
          event.key.toLocaleLowerCase("fr"),
        at: now,
      };
      const normalized = query.current.text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const found = options.findIndex(
        (option) =>
          !option.disabled &&
          option.label
            .toLocaleLowerCase("fr")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .startsWith(normalized),
      );
      if (found >= 0) setActive(found);
    }
  }
  return (
    <>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        className={`gp-select-trigger gp-select-${variant}${applied ? " is-applied" : ""}${open ? " is-open" : ""}`}
        aria-label={label}
        aria-describedby={`${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span id={`${id}-value`}>
          {options.find((option) => option.value === value)?.label ||
            options[0]?.label}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {name || required ? (
        <select
          name={name}
          value={value}
          required={required}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
          onChange={(event) => onChange(event.target.value)}
          onInvalid={(event) => {
            event.preventDefault();
            button.current?.focus();
            show();
          }}
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
      {open
        ? createPortal(
            <div
              ref={menu}
              id={`${id}-menu`}
              role="listbox"
              aria-label={label}
              aria-activedescendant={`${id}-option-${active}`}
              tabIndex={-1}
              className="gp-select-menu"
              style={position}
              onKeyDown={keyboard}
            >
              <div className="gp-select-heading" role="presentation">
                <strong>{label}</strong>
                {hint ? <span>{hint}</span> : null}
              </div>
              <div className="gp-select-options" role="presentation">
                {options.map((option, index) => (
                  <div
                    id={`${id}-option-${index}`}
                    key={option.value}
                    role="option"
                    aria-selected={option.value === value}
                    aria-disabled={option.disabled || undefined}
                    className={`gp-select-option${option.value === value ? " is-selected" : ""}${active === index ? " is-active" : ""}`}
                    onPointerMove={() => {
                      if (!option.disabled) setActive(index);
                    }}
                    onClick={() => choose(index)}
                  >
                    <span>{option.label}</span>
                    {option.value === value ? (
                      <Check size={17} aria-hidden="true" />
                    ) : (
                      <span className="gp-select-check" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
