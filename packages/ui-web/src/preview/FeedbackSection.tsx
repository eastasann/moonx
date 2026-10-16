import { formatCount } from "@moonx/i18n";
import {
  badgeFillStyles,
  badgeVariants,
  illustratedMessageSizes,
  sizes,
  statusLightVariants,
  statusVariants,
} from "@moonx/ui-tokens";
import { Calendar, Inbox, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Heading } from "../components/Heading";
import { IllustratedMessage } from "../components/IllustratedMessage";
import { InlineAlert } from "../components/InlineAlert";
import { ProgressBar } from "../components/ProgressBar";
import { Skeleton } from "../components/Skeleton";
import { StatusLight } from "../components/StatusLight";
import { Switch } from "../components/Switch";
import { Text } from "../components/Text";
import { ToastQueue } from "../components/Toast";
import { Flex, Stack } from "../layout/Flex";
import { Section, Specimen } from "./parts";
import * as styles from "./preview.css";

const alertTitles = {
  informative: "A new template is available",
  notice: "Gross margin is negative",
  negative: "Couldn't save",
  neutral: "This idea is archived",
} as const;

export function InlineAlertSection() {
  const [isShown, setShown] = useState(true);
  return (
    <Section title="InlineAlert">
      <Specimen name='variant="informative" / "notice" / "negative" / "neutral"'>
        <Stack gap="space-200">
          {statusVariants.map((variant) => (
            <InlineAlert
              key={variant}
              variant={variant}
              title={alertTitles[variant]}
            >
              Shown beside what it is about, or as a band at the top.
            </InlineAlert>
          ))}
        </Stack>
      </Specimen>
      <Specimen name="onDismiss (a band that can be closed)">
        {isShown ? (
          <InlineAlert onDismiss={() => setShown(false)}>
            <Flex gap="space-200" wrap alignItems="center">
              <Text>A new version of moonx is available.</Text>
              <Button variant="secondary" size="S">
                Reload
              </Button>
            </Flex>
          </InlineAlert>
        ) : (
          <Button variant="secondary" onPress={() => setShown(true)}>
            Show the band again
          </Button>
        )}
      </Specimen>
    </Section>
  );
}

export function ToastSection({
  aboveTabBar,
  onAboveTabBarChange,
}: {
  aboveTabBar: boolean;
  onAboveTabBarChange: (aboveTabBar: boolean) => void;
}) {
  const [undone, setUndone] = useState(0);
  return (
    <Section title="Toast">
      <Switch isSelected={aboveTabBar} onChange={onAboveTabBarChange}>
        aboveTabBar (a phone with a TabBar)
      </Switch>
      <Specimen name="ToastQueue.neutral (timeout 5000, an action, no timeout)">
        <Flex gap="space-200" wrap alignItems="center">
          <Button
            variant="secondary"
            onPress={() =>
              ToastQueue.neutral("Decision recorded", { timeout: 5000 })
            }
          >
            Record decision
          </Button>
          <Button
            variant="secondary"
            onPress={() =>
              ToastQueue.neutral("Duplicated from Piaya Gift Box", {
                actionLabel: "Undo",
                onAction: () => setUndone((count) => count + 1),
                shouldCloseOnAction: true,
              })
            }
          >
            Duplicate idea
          </Button>
          <Button
            variant="secondary"
            onPress={() =>
              ToastQueue.neutral("2 answers updated · 1 needs F/A/U")
            }
          >
            Apply changes
          </Button>
          <Text tone="secondary">{`Undone: ${undone}`}</Text>
        </Flex>
      </Specimen>
    </Section>
  );
}

export function ProgressBarSection() {
  return (
    <Section title="ProgressBar">
      <Specimen name="size S / M / L / XL">
        <Stack gap="space-300">
          {sizes.map((size) => (
            <ProgressBar
              key={size}
              size={size}
              label={`Uploading ${size}`}
              value={40}
            />
          ))}
        </Stack>
      </Specimen>
      <Specimen name="isIndeterminate">
        <ProgressBar label="Preparing PDF…" isIndeterminate />
      </Specimen>
    </Section>
  );
}

export function SkeletonSection() {
  const [isLoading, setLoading] = useState(true);
  return (
    <Section title="Skeleton">
      <Switch isSelected={isLoading} onChange={setLoading}>
        Loading
      </Switch>
      <Specimen name="isLoading: Text and Heading draw bars of their words">
        <Skeleton isLoading={isLoading}>
          <Stack gap="space-200">
            <Heading level={3}>Piaya Gift Box</Heading>
            <Text elementType="p">
              Office workers in Bacolod who buy pasalubong for family.
            </Text>
            <Text variant="caption">Updated 2h ago</Text>
          </Stack>
        </Skeleton>
      </Specimen>
    </Section>
  );
}

export function IllustratedMessageSection() {
  return (
    <Section title="IllustratedMessage">
      {illustratedMessageSizes.map((size) => (
        <Specimen key={size} name={`size ${size}`}>
          <IllustratedMessage
            size={size}
            headingLevel={3}
            icon={
              size === "S" ? (
                <Search />
              ) : size === "M" ? (
                <Inbox />
              ) : (
                <Calendar />
              )
            }
            heading={
              size === "S"
                ? "Nothing matches these filters"
                : `No ideas yet (${size})`
            }
            actions={<Button variant="secondary">New idea</Button>}
          >
            Ideas you validate show up here.
          </IllustratedMessage>
        </Specimen>
      ))}
    </Section>
  );
}

const statusLabels = {
  fact: "Fact · 2 sources",
  assumption: "Assumption · Medium",
  unknown: "Unknown",
  unclassified: "Unclassified",
  empty: "Empty",
  "not-started": "Not started",
  partial: "Partial",
  done: "Done",
  saving: "Saving…",
  saved: "Saved",
  "save-failed": "Couldn't save",
} as const;

export function StatusLightSection() {
  return (
    <Section title="StatusLight">
      <Specimen name="variant (F/A/U, check states, save states)">
        <Flex gap="space-300" wrap>
          {statusLightVariants.map((variant) => (
            <StatusLight key={variant} variant={variant}>
              {statusLabels[variant]}
            </StatusLight>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="size S / M / L / XL">
        <Flex gap="space-300" wrap alignItems="center">
          {sizes.map((size) => (
            <StatusLight key={size} variant="partial" size={size}>
              {`Partial ${size}`}
            </StatusLight>
          ))}
        </Flex>
      </Specimen>
    </Section>
  );
}

export function BadgeSection() {
  return (
    <Section title="Badge">
      <Specimen name='fillStyle="outline" / "dashed" / "bold"'>
        <Flex gap="space-200" wrap alignItems="center">
          {badgeFillStyles.map((fillStyle) => (
            <Badge key={fillStyle} fillStyle={fillStyle}>
              {fillStyle === "outline"
                ? "Proceed"
                : fillStyle === "dashed"
                  ? "Undecided"
                  : formatCount(120)}
            </Badge>
          ))}
        </Flex>
      </Specimen>
      <Specimen name='variant="neutral" / "notice" (notice: amber text in the outline frame)'>
        <Flex gap="space-200" wrap alignItems="center">
          {badgeVariants.map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant === "notice" ? "overdue 3d" : "Lump sum"}
            </Badge>
          ))}
        </Flex>
      </Specimen>
      <Specimen name="a long label in a narrow space ends in an ellipsis">
        <div className={styles.narrowBox}>
          <Badge>(former member) Maria Clara de los Santos</Badge>
        </div>
      </Specimen>
      <Specimen name="size S / M / L / XL">
        <Flex gap="space-200" wrap alignItems="center">
          {sizes.map((size) => (
            <Badge key={size} size={size}>
              {`Hold ${size}`}
            </Badge>
          ))}
        </Flex>
      </Specimen>
    </Section>
  );
}
