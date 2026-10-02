import type { ComponentSize } from "@moonx/ui-tokens";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Autocomplete,
  Input,
  ListBox,
  ListBoxItem,
  TextField,
  useFilter,
} from "react-aria-components";
import {
  box,
  fieldRoot,
  label as labelClass,
  listbox,
  listItem,
  textArea,
} from "../_internal/field.css";
import { trayDialog } from "../ComboBox/ComboBox.css";
import { useIsNarrow } from "../ResponsivePopover";
import { Tray } from "../Tray";

export interface MentionCandidate {
  id: string;
  name: string;
}

export interface MentionTextAreaProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  /** The people `@` can name. The screen decides who is allowed (roles, self analysis). */
  candidates: readonly MentionCandidate[];
  /** Called with the id of the person whose `@Name` was just inserted. */
  onMention: (id: string) => void;
  /** Accessible name of the candidate list. */
  listLabel: string;
  size?: ComponentSize;
  placeholder?: string;
}

const TRIGGER = /(^|\s)@([^\s@]*)$/;

/** The text typed after an `@` that ends at the caret, or null when the caret is not in one. */
export function findMentionQuery(text: string, caret: number): string | null {
  return TRIGGER.exec(text.slice(0, caret))?.[2] ?? null;
}

/** Replaces the `@query` before the caret with `@Name ` and returns the text and the new caret. */
export function applyMention(text: string, caret: number, name: string) {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  const inserted = `${before.slice(0, start)}@${name} `;
  return { text: `${inserted}${text.slice(caret)}`, caret: inserted.length };
}

/**
 * A multi-line field where typing `@` and some letters lists the candidates. From tablet width
 * the list is a listbox the textarea points at with `aria-controls` and `aria-activedescendant`,
 * so focus stays in the text. The textarea keeps its textbox role because ARIA does not allow
 * `combobox` on it. Up and Down move, Enter and Tab choose, Escape closes. Below
 * `semantic.breakpoint.tablet` the candidates are chosen in a tray that holds its own search
 * field, started with what was typed after the `@` (design-spec 4.5, as ComboBox does).
 */
export function MentionTextArea({
  label,
  value,
  onChange,
  candidates,
  onMention,
  listLabel,
  size = "M",
  placeholder,
}: MentionTextAreaProps) {
  const id = useId();
  const listId = `${id}-list`;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const pendingCaret = useRef<number | null>(null);
  const narrow = useIsNarrow();

  const query = dismissed ? null : findMentionQuery(value, caret);
  const matches =
    query === null
      ? []
      : candidates.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const open = matches.length > 0;
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    if (pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const choose = (candidate: MentionCandidate) => {
    const next = applyMention(value, caret, candidate.name);
    pendingCaret.current = next.caret;
    setCaret(next.caret);
    onChange(next.text);
    onMention(candidate.id);
    ref.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) return;
    const chosen = matches[activeIndex];
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + matches.length) % matches.length);
    } else if ((event.key === "Enter" || event.key === "Tab") && chosen) {
      event.preventDefault();
      choose(chosen);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
    }
  };

  const onTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setDismissed(false);
    setActive(0);
    setCaret(event.target.selectionStart);
    onChange(event.target.value);
  };

  return (
    <div className={fieldRoot({ size })}>
      <label htmlFor={id} className={labelClass({ size })}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={1}
        value={value}
        placeholder={placeholder}
        className={`${box({ size })} ${textArea}`}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={open && !narrow ? listId : undefined}
        aria-activedescendant={
          open && !narrow ? `${id}-option-${matches[activeIndex]?.id}` : undefined
        }
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
      />
      {narrow ? (
        <Tray
          aria-label={listLabel}
          isOpen={open}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDismissed(true);
          }}
        >
          {/* Mounted only while open, so the search field starts from the text typed after the @. */}
          <CandidateTray
            initialQuery={query ?? ""}
            candidates={candidates}
            listLabel={listLabel}
            size={size}
            onChoose={choose}
          />
        </Tray>
      ) : open ? (
        <div id={listId} role="listbox" aria-label={listLabel} className={listbox}>
          {matches.map((candidate, index) => (
            // The textarea keeps focus, so options are not tab stops; Enter and Tab choose.
            // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard use goes through the textarea (activedescendant)
            <div
              key={candidate.id}
              id={`${id}-option-${candidate.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              data-focused={index === activeIndex ? "" : undefined}
              className={listItem({ size })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(candidate)}
            >
              {candidate.name}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CandidateTray({
  initialQuery,
  candidates,
  listLabel,
  size,
  onChoose,
}: {
  initialQuery: string;
  candidates: readonly MentionCandidate[];
  listLabel: string;
  size: ComponentSize;
  onChoose: (candidate: MentionCandidate) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const { contains } = useFilter({ sensitivity: "base" });
  return (
    <div className={trayDialog}>
      <Autocomplete filter={contains} inputValue={query} onInputChange={setQuery}>
        <TextField aria-label={listLabel}>
          <Input autoFocus className={box({ size })} />
        </TextField>
        <ListBox
          aria-label={listLabel}
          className={listbox}
          onAction={(key) => {
            const chosen = candidates.find((candidate) => candidate.id === key);
            if (chosen) onChoose(chosen);
          }}
        >
          {candidates.map((candidate) => (
            <ListBoxItem
              key={candidate.id}
              id={candidate.id}
              textValue={candidate.name}
              className={listItem({ size })}
            >
              {candidate.name}
            </ListBoxItem>
          ))}
        </ListBox>
      </Autocomplete>
    </div>
  );
}
