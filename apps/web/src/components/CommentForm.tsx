import type { Member, UserRef } from "@moonx/schemas";
import { Button, Form, InlineAlert, MentionTextArea, Stack, Text } from "@moonx/ui-web";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { isApiError } from "../lib/api-error";
import { mentionedIds } from "../lib/comment-text";
import { errorText } from "../lib/error-text";

/**
 * The input of PNL-1: a new comment, a reply or an edit. The text and the picked mentions stay
 * when the post fails, with the reason and a Retry (design-spec 6.0.4).
 */
export function CommentForm({
  label,
  submitLabel,
  initialBody = "",
  initialMentions = [],
  candidates,
  isSelfAnalysis,
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  initialBody?: string;
  initialMentions?: readonly UserRef[];
  candidates: Member[];
  /** The target is a self-analysis answer, whose mention rule differs. */
  isSelfAnalysis: boolean;
  /** Resolves when the comment is stored; a rejection is shown and the input is kept. */
  onSubmit: (body: string, mentionUserIds: string[]) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation("panels");
  const [body, setBody] = useState(initialBody);
  const [picked, setPicked] =
    useState<readonly Pick<UserRef, "id" | "displayName">[]>(initialMentions);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    const text = body.trim();
    if (text === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(text, mentionedIds(text, picked));
      if (!onCancel) {
        setBody("");
        setPicked([]);
      }
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  };

  const message =
    isApiError(error) && error.code === "INVALID_MENTION"
      ? t(isSelfAnalysis ? "comments.invalidMentionSelfAnalysis" : "comments.invalidMention")
      : errorText(t, error);

  return (
    <Form
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Stack gap="space-100">
        <MentionTextArea
          label={label}
          value={body}
          onChange={setBody}
          size="S"
          listLabel={t("comments.mentionList")}
          candidates={candidates.map((member) => ({
            id: member.user.id,
            name: member.user.displayName,
          }))}
          onMention={(id) => {
            const member = candidates.find((m) => m.user.id === id);
            if (member) setPicked((current) => [...current, member.user]);
          }}
        />
        {error ? (
          <InlineAlert
            variant="negative"
            heading={t(onCancel ? "comments.saveFailed" : "comments.postFailed")}
          >
            <Text variant="body-sm" as="span">
              {message}
            </Text>
          </InlineAlert>
        ) : null}
        <Stack gap="space-100">
          <Button
            type="submit"
            size="S"
            variant={error ? "secondary" : "primary"}
            isDisabled={body.trim() === ""}
            isPending={pending}
            pendingLabel={t("comments.posting")}
          >
            {error ? t("comments.retry") : submitLabel}
          </Button>
          {onCancel ? (
            <Button size="S" variant="secondary" onPress={onCancel}>
              {t("comments.cancel")}
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Form>
  );
}
