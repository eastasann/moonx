import { useState } from "react";
import { AlertBanner } from "../components/AlertBanner";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { CostPreview } from "../components/CostPreview";
import { DiffTextArea } from "../components/DiffTextArea";
import { IdeaPreview } from "../components/IdeaPreview";
import { Link } from "../components/Link";
import { ActionMenu, MenuItem } from "../components/Menu";
import { PhaseRoute } from "../components/PhaseRoute";
import { Picker } from "../components/Picker";
import { Stack } from "../layout/Flex";
import { SettingsList, SettingsListItem } from "../patterns/SettingsPattern";
import { Section, Specimen } from "./parts";

const roles = [
  { id: "owner", label: "Owner" },
  { id: "member", label: "Member" },
];

/** The bands under the header, a field that marks what it adds, and 9's rows. */
export function AlertBannerSection() {
  const [shown, setShown] = useState(true);
  const [imported, setImported] = useState(
    "Office workers in Bacolod who buy pasalubong for family.",
  );
  return (
    <Section title="AlertBanner, DiffTextArea and SettingsList">
      <Specimen name="AlertBanner: informative with an action, notice, dismissable">
        <Stack gap="space-100">
          <AlertBanner
            title="A newer template is available."
            action={<Link href="#update-template">Update template</Link>}
          >
            Your answers stay on v3 until you update.
          </AlertBanner>
          <AlertBanner variant="notice">
            You're offline. Changes can't be saved until you reconnect.
          </AlertBanner>
          {shown && (
            <AlertBanner
              action={
                <Button variant="secondary" size="S">
                  Reload
                </Button>
              }
              onDismiss={() => setShown(false)}
            >
              A new version of moonx is available.
            </AlertBanner>
          )}
        </Stack>
      </Specimen>
      <Specimen name="DiffTextArea: what it adds stays underlined while typing">
        <DiffTextArea
          label="Imported · you can edit"
          before="Office workers who buy pasalubong."
          value={imported}
          onChange={setImported}
        />
      </Specimen>
      <Specimen name="SettingsList: members and invitations (9)">
        <SettingsList aria-label="Gallery members">
          <SettingsListItem
            avatar={<Avatar name="Ana Reyes" size="M" />}
            title="Ana Reyes"
            titleNote="(you)"
            description="ana@example.com"
            control={
              <Picker
                aria-label="Role of Ana Reyes"
                items={roles}
                defaultValue="owner"
                size="S"
                isDisabled
              />
            }
            actions={
              <ActionMenu aria-label="Member actions of Ana Reyes" isDisabled>
                <MenuItem id="remove">Remove</MenuItem>
              </ActionMenu>
            }
            note="This workspace needs at least one Owner"
          />
          <SettingsListItem
            title="new.member@example.com"
            description="Member · sent Oct 9 · expires Oct 16"
            actions={
              <Button variant="secondary" isQuiet>
                Resend
              </Button>
            }
          />
        </SettingsList>
      </Specimen>
    </Section>
  );
}

/** The landing's examples (6.16 の 1). */
export function LandingExamplesSection() {
  return (
    <Section title="IdeaPreview, PhaseRoute and CostPreview">
      <IdeaPreview
        name="Office Lunch Bowls"
        stage="Validation"
        metrics={[
          { label: "Startup costs", value: "₱145,000+" },
          { label: "Break-even", value: "14.4+ / day" },
        ]}
        checks={[
          { state: "done", label: "Competitors (3–5)", status: "Done (4)" },
          {
            state: "partial",
            label: "Startup and monthly costs",
            status: "Partial",
          },
        ]}
        caption="An example idea in validation."
      />
      <PhaseRoute
        phases={[
          { value: 0, title: "Self Analysis", description: "Your strengths." },
          {
            value: 0.5,
            title: "Validation",
            description: "Research and costs.",
          },
          {
            value: 1,
            title: "Business plan",
            description: "Milestones and a deck.",
          },
        ]}
      />
      <CostPreview
        aria-label="Example startup costs"
        rows={[
          { state: "fact", name: "Equipment", amount: "₱60,000" },
          {
            state: "unknown",
            name: "Permits",
            amount: "Unknown",
            isMuted: true,
          },
        ]}
        totals={[
          { label: "Startup", value: "₱145,000+" },
          { label: "Break-even", value: "14.4+ / day" },
        ]}
      />
    </Section>
  );
}
