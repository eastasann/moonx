import {
  ActionButton,
  Button,
  Flex,
  Heading,
  Menu,
  MenuItem,
  QuestionFormPattern,
  Stack,
  Switch,
  Text,
  useIsNarrow,
} from "@moonx/ui-web";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGoTo } from "../lib/navigate";

const FOCUS_STORAGE_KEY = "moonx.questions.focus";

/** The Focus switch is remembered on this device (design-spec 4.1). */
function useFocusMode(): [boolean, (value: boolean) => void] {
  const [focus, setFocus] = useState(() => {
    try {
      return window.localStorage.getItem(FOCUS_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const update = (value: boolean) => {
    setFocus(value);
    try {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, value ? "on" : "off");
    } catch {
      // The choice then lasts until the page is closed, which is all a browser that refuses storage can do.
    }
  };
  return [focus, update];
}

export interface QuestionFormSection {
  key: string;
  title: string;
  /** Where the section opens. */
  href: string;
}

/** What the frame hands the screen to draw the cards with. */
export interface QuestionFormState {
  /** Every card is open and none scrolls (the Focus switch is off, or the person is read-only). */
  isOpenAll: boolean;
  isFocused: (questionKey: string) => boolean;
  onFocusRequest: (questionKey: string) => void;
  onNavigate: (direction: "previous" | "next") => void;
}

export interface QuestionFormFrameProps {
  /** The section being answered; the heading and the first entry of the switcher. */
  section: QuestionFormSection;
  /** Every section in the order of the Next / Previous buttons. */
  sections: readonly QuestionFormSection[];
  guidance: string | null;
  /** Shown above the heading: the archived notice. */
  alert?: ReactNode;
  /** Shown under the guidance: a hint that a question is hidden. */
  notices?: ReactNode;
  /** The questions that show, in order, and whether each is answered. */
  questions: readonly { key: string; answered: boolean }[];
  /** The question to open on; the first unanswered one when it is not among `questions`. */
  initialQuestionKey?: string;
  /** Where "back to the home" of the complete card goes, and what it says. */
  home: { href: string; label: string };
  canEdit: boolean;
  /** The AI menu between Previous and Next section; null for a reader. */
  aiMenu: ReactNode;
  children: (state: QuestionFormState) => ReactNode;
}

/**
 * Pattern C around the cards of screen 11 (design-spec 6.2): the heading with its section
 * switcher, the answered count and the Focus switch, Previous / Next section on the Web, and the
 * dots with the completion card on the phone. Which question has the focus lives here, so a
 * validation and a self analysis behave the same.
 */
export function QuestionFormFrame({
  section,
  sections,
  guidance,
  alert,
  notices,
  questions,
  initialQuestionKey,
  home,
  canEdit,
  aiMenu,
  children,
}: QuestionFormFrameProps) {
  const { t } = useTranslation("form");
  const narrow = useIsNarrow();
  const goTo = useGoTo();
  const [focusMode, setFocusMode] = useFocusMode();

  const answered = questions.filter((question) => question.answered).length;
  const firstOpen = () => {
    const wanted = questions.find((question) => question.key === initialQuestionKey);
    if (wanted) return wanted.key;
    return (questions.find((question) => !question.answered) ?? questions[0])?.key ?? null;
  };
  const [focusedKey, setFocusedKey] = useState<string | null>(firstOpen);
  const [complete, setComplete] = useState(false);

  const openAll = !canEdit || (!narrow && !focusMode);
  const index = questions.findIndex((question) => question.key === focusedKey);
  const move = (direction: "previous" | "next") => {
    const target = questions[index + (direction === "next" ? 1 : -1)];
    if (target) {
      setComplete(false);
      setFocusedKey(target.key);
    } else if (direction === "next" && narrow) {
      setComplete(true);
    }
  };

  const position = sections.findIndex((candidate) => candidate.key === section.key);
  const previous = sections[position - 1] ?? null;
  const next = sections[position + 1] ?? null;

  const header = (
    <Stack gap="space-200">
      {alert}
      <Flex gap="space-200" align="center" justify="between" wrap>
        <Flex gap="space-100" align="center" wrap>
          <Heading level={1}>{section.title}</Heading>
          <Menu
            trigger={
              <ActionButton isQuiet icon={<ChevronDown />} aria-label={t("switchSection")} />
            }
          >
            {sections.map((candidate) => (
              <MenuItem key={candidate.key} id={candidate.key} href={candidate.href}>
                {candidate.title}
              </MenuItem>
            ))}
          </Menu>
        </Flex>
        <Flex gap="space-200" align="center" wrap>
          <Text variant="label" as="span">
            {t("answered", { answered, total: questions.length })}
          </Text>
          {narrow || !canEdit ? null : (
            <Switch isSelected={focusMode} onChange={setFocusMode}>
              {t("focus")}
            </Switch>
          )}
        </Flex>
      </Flex>
      {guidance ? <Text tone="secondary">{guidance}</Text> : null}
      {notices}
    </Stack>
  );

  const sectionButtons = (
    <Flex gap="space-200" align="center" justify="between" wrap>
      <Button
        variant="secondary"
        isDisabled={!previous}
        onPress={() => previous && goTo(previous.href)}
      >
        {t("previousSection")}
      </Button>
      {aiMenu}
      <Button variant="secondary" isDisabled={!next} onPress={() => next && goTo(next.href)}>
        {t("nextSection")}
      </Button>
    </Flex>
  );

  const phoneControls = (
    <Flex gap="space-200" align="center" justify="between">
      <Button
        variant="secondary"
        isDisabled={index <= 0 && !complete}
        onPress={() => (complete ? setComplete(false) : move("previous"))}
      >
        {t("previous")}
      </Button>
      <Flex gap="space-100" align="center" as="ol">
        {questions.map((question, place) => {
          const current = question.key === focusedKey && !complete;
          return (
            <li key={question.key}>
              <ActionButton
                isQuiet
                aria-label={t("dot", { position: place + 1, total: questions.length })}
                aria-current={current ? "step" : undefined}
                onPress={() => {
                  setComplete(false);
                  setFocusedKey(question.key);
                }}
              >
                {current ? "◉" : question.answered ? "●" : "○"}
              </ActionButton>
            </li>
          );
        })}
      </Flex>
      <Button variant="secondary" isDisabled={complete} onPress={() => move("next")}>
        {t("nextQuestion")}
      </Button>
    </Flex>
  );

  return (
    <QuestionFormPattern
      header={header}
      hasTabBar
      actions={narrow ? phoneControls : sectionButtons}
    >
      {narrow && complete ? (
        <Stack gap="space-200">
          <Heading level={2}>{t("complete.title")}</Heading>
          <Text>
            {t("complete.summary", {
              section: section.title,
              answered,
              total: questions.length,
            })}
          </Text>
          <Flex gap="space-200" wrap>
            {next ? (
              <Button onPress={() => goTo(next.href)}>
                {t("complete.next", { section: next.title })}
              </Button>
            ) : null}
            <Button variant="secondary" onPress={() => goTo(home.href)}>
              {home.label}
            </Button>
          </Flex>
        </Stack>
      ) : (
        children({
          isOpenAll: openAll,
          isFocused: (questionKey) => questionKey === focusedKey,
          onFocusRequest: setFocusedKey,
          onNavigate: move,
        })
      )}
    </QuestionFormPattern>
  );
}
